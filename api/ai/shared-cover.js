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
    // 1. Fetch the shared recipe via existing get_shared_recipe RPC
    const { data: recipeData, error: recipeErr } = await serviceClient.rpc(
      "get_shared_recipe",
      {
        p_token: cleanToken,
      },
    );

    if (recipeErr || !recipeData) {
      return res.status(404).json({
        error: "Shared recipe not found or access link has been revoked.",
        code: "RECIPE_NOT_FOUND",
        requestId,
      });
    }

    const artwork = recipeData.artwork;
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

    // 2. Extract storage object path from artwork URL
    const parts = artwork.split("/recipe-covers/");
    if (parts.length !== 2) {
      return res.status(400).json({
        error: "Malformed cover image path.",
        requestId,
      });
    }
    const rawPath = decodeURIComponent(parts[1].split("?")[0].trim());

    // 3. Generate 30-minute signed URL using service_role
    const { data: signedData, error: signError } = await serviceClient.storage
      .from("recipe-covers")
      .createSignedUrl(rawPath, 1800); // 30 minutes in seconds

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
