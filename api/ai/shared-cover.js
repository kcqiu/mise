import { randomUUID } from "node:crypto";
import {
  checkRateLimit,
  getClientIp,
  getServiceRoleSupabaseClient,
  hashIp,
} from "../../server/aiAuth.js";

const TOKEN_REGEX = /^[a-zA-Z0-9_-]{16,64}$/;

export default async function handler(req, res) {
  const requestId =
    req.headers["x-request-id"] ||
    req.headers["x-vercel-id"] ||
    randomUUID();

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res
      .status(405)
      .json({ error: "Method not allowed. Use GET.", requestId });
  }

  const clientIp = getClientIp(req);
  const hashedIp = hashIp(clientIp);

  // Rate limit: 60 requests/minute per IP
  const rate = checkRateLimit(`ip:${hashedIp}:shared-cover`, 60, 60000);
  if (!rate.allowed) {
    res.setHeader("Retry-After", String(rate.retryAfterSeconds));
    return res.status(429).json({
      error: "Rate limit exceeded. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
      requestId,
    });
  }

  const token = req.query?.token;
  if (!token || typeof token !== "string" || !TOKEN_REGEX.test(token.trim())) {
    return res.status(400).json({
      error: "Invalid or missing share token.",
      code: "INVALID_SHARE_TOKEN",
      requestId,
    });
  }

  const cleanToken = token.trim();
  const serviceClient = getServiceRoleSupabaseClient();
  if (!serviceClient) {
    return res.status(503).json({
      error: "Cover signing service is temporarily unavailable.",
      requestId,
    });
  }

  try {
    // 1. Fetch active share record
    const { data: shareData, error: shareErr } = await serviceClient
      .from("recipe_shares")
      .select("recipe_id, owner_id, revoked_at, expires_at")
      .eq("share_token", cleanToken)
      .maybeSingle();

    if (
      shareErr ||
      !shareData ||
      shareData.revoked_at ||
      (shareData.expires_at && new Date(shareData.expires_at) <= new Date())
    ) {
      if (shareErr) {
        console.error(
          `[Shared Cover Error][${requestId}] Failed to query share record:`,
          shareErr,
        );
      }
      return res.status(404).json({
        error: "Shared recipe not found or access link has been revoked.",
        code: "RECIPE_NOT_FOUND",
        requestId,
      });
    }

    // 2. Fetch the recipe to verify owner and artwork
    const { data: recipeData, error: recipeErr } = await serviceClient
      .from("recipes")
      .select("id, owner_id, payload")
      .eq("id", shareData.recipe_id)
      .maybeSingle();

    if (recipeErr || !recipeData || !recipeData.payload) {
      if (recipeErr) {
        console.error(
          `[Shared Cover Error][${requestId}] Failed to query recipe:`,
          recipeErr,
        );
      }
      return res.status(404).json({
        error: "Shared recipe not found.",
        code: "RECIPE_NOT_FOUND",
        requestId,
      });
    }

    const artwork = recipeData.payload.artwork;
    if (
      !artwork ||
      typeof artwork !== "string" ||
      !artwork.includes("/recipe-covers/")
    ) {
      return res.status(404).json({
        error: "No private cover image attached to this recipe.",
        code: "NO_COVER",
        requestId,
      });
    }

    // 3. Extract and enforce strict authorization invariants on storage path
    const parts = artwork.split("/recipe-covers/");
    if (parts.length !== 2) {
      return res.status(400).json({
        error: "Malformed cover image path.",
        code: "MALFORMED_PATH",
        requestId,
      });
    }
    const rawPath = decodeURIComponent(parts[1].split("?")[0].trim());
    const segments = rawPath.split("/").filter(Boolean);

    // Invariant: Exactly two path segments (<ownerId>/<filename>)
    if (segments.length !== 2 || rawPath.includes("..")) {
      return res.status(400).json({
        error: "Invalid storage path structure.",
        code: "INVALID_PATH_STRUCTURE",
        requestId,
      });
    }

    const [folder, filename] = segments;
    const expectedOwnerId = recipeData.owner_id;
    const expectedRecipeId = recipeData.id;

    // Invariant: Share record owner must match recipe owner
    if (shareData.owner_id !== expectedOwnerId) {
      return res.status(403).json({
        error: "Share record owner mismatch.",
        code: "OWNER_MISMATCH",
        requestId,
      });
    }

    // Invariant: Storage folder must strictly match recipe owner ID
    if (folder !== expectedOwnerId) {
      return res.status(403).json({
        error: "Storage object owner mismatch.",
        code: "OWNER_MISMATCH",
        requestId,
      });
    }

    // Invariant: Basename must belong to this recipe ID and have an allowed image extension
    const escapedRecipeId = expectedRecipeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const allowedExts = "webp|png|jpe?g";
    const filenamePattern = new RegExp(`^${escapedRecipeId}(?:-[\\w.-]+)?\\.(?:${allowedExts})$`, "i");

    if (!filenamePattern.test(filename)) {
      return res.status(403).json({
        error: "Storage object does not belong to the authorized recipe.",
        code: "RECIPE_MISMATCH",
        requestId,
      });
    }

    const verifiedPath = `${folder}/${filename}`;

    // 4. Generate 30-minute signed URL using service_role
    const { data: signedData, error: signError } = await serviceClient.storage
      .from("recipe-covers")
      .createSignedUrl(verifiedPath, 1800); // 30 minutes in seconds

    if (signError || !signedData?.signedUrl) {
      return res.status(500).json({
        error: "Failed to generate signed cover URL.",
        requestId,
      });
    }

    return res.status(200).json({
      success: true,
      signedUrl: signedData.signedUrl,
      requestId,
    });
  } catch (err) {
    console.error(`[SharedCover Error][${requestId}]:`, err);
    return res.status(500).json({
      error: "An unexpected error occurred while generating cover access.",
      requestId,
    });
  }
}
