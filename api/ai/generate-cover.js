import { randomUUID } from "node:crypto";
import { requireAiAuth } from "../../server/aiAuth.js";

export default async function handler(req, res) {
  const requestId =
    req.headers["x-request-id"] ||
    req.headers["x-vercel-id"] ||
    randomUUID();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST.", requestId });
  }

  const user = await requireAiAuth(req, res, {
    action: "cover",
    quota: 5,
    dualIpThrottle: true,
  });
  if (!user) return;

  const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
  const byteLength = Buffer.byteLength(rawBody, "utf8");
  if (byteLength > 100 * 1024) {
    return res.status(413).json({
      error: `Request payload too large (${Math.round(byteLength / 1024)}KB). Maximum allowed is 100KB.`,
      code: "PAYLOAD_TOO_LARGE",
      requestId,
    });
  }

  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!cfToken || !cfAccountId) {
    console.error(`[AI Cover Error][${requestId}] Missing Cloudflare API credentials`);
    return res.status(503).json({
      error: "AI image generation service is currently unavailable.",
      requestId
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const recipe = body.recipe;

  if (!recipe || typeof recipe !== "object" || !recipe.title) {
    return res.status(400).json({
      error: "Recipe details with at least a title are required to generate a cover.",
      requestId
    });
  }

  const keyIngredients = (recipe.ingredients || [])
    .map((i) => (typeof i === "string" ? i : i.name))
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
  const cuisine = recipe.cuisine ? `${recipe.cuisine} style` : "gourmet";

  const prompt = `Vertical portrait composition, professional high-end culinary food photograph of ${recipe.title}, ${cuisine}. ${
    recipe.description ? recipe.description + "." : ""
  } Featuring: ${keyIngredients || "fresh ingredients"}. Beautifully plated on artisanal matte ceramic tableware with natural garnish, shot on 50mm f/2.8 lens, angled 45-degree three-quarter perspective, main dish in upper two-thirds with soft ambient tabletop depth below. Soft directional morning window side lighting, gentle rising steam, shallow depth of field with rich organic textures, editorial food magazine style, photorealistic, 8k resolution.`;

  try {
    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

    const cfRes = await fetch(cfUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    if (!cfRes.ok) {
      const errBody = await cfRes.text();
      console.error(`[AI Cover Error][${requestId}] Cloudflare AI error (${cfRes.status}):`, errBody);

      if (cfRes.status === 429) {
        return res.status(429).json({
          error: "Cloudflare free tier daily limit reached. Try again tomorrow or upload a photo instead!",
          requestId
        });
      }
      return res.status(500).json({
        error: "Cover generation failed. Please try again.",
        requestId
      });
    }

    const data = await cfRes.json();
    const imageBase64 = data?.result?.image;

    if (!imageBase64) {
      console.error(`[AI Cover Error][${requestId}] No image data returned from Cloudflare FLUX`);
      return res.status(500).json({
        error: "Cover generation failed. Please try again.",
        requestId
      });
    }

    return res.status(200).json({
      success: true,
      base64: imageBase64,
      mimeType: "image/png",
      prompt,
      requestId
    });
  } catch (err) {
    console.error(`[AI Cover Error][${requestId}]:`, err);
    return res.status(500).json({
      error: "Cover generation failed. Please try again.",
      requestId
    });
  }
}
