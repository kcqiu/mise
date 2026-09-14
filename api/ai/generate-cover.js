export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!cfToken || !cfAccountId) {
    return res.status(503).json({
      error: "Cloudflare API credentials are not configured. Please add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in your Vercel Project Environment Variables.",
      missingKey: true
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const recipe = body.recipe;

  if (!recipe || typeof recipe !== "object" || !recipe.title) {
    return res.status(400).json({ error: "Recipe details with at least a title are required to generate a cover." });
  }

  const keyIngredients = (recipe.ingredients || [])
    .map((i) => (typeof i === "string" ? i : i.name))
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
  const cuisine = recipe.cuisine ? `${recipe.cuisine} style` : "gourmet";

  const prompt = `Professional, high-end editorial food photography of ${recipe.title}, ${cuisine}. ${
    recipe.description ? recipe.description + "." : ""
  } Featuring: ${keyIngredients || "fresh ingredients"}. Plated appetizingly on rustic ceramic dish, warm soft natural side lighting, steam gently rising, symmetrical composition, shallow depth of field, 8k resolution, food magazine cover style, photorealistic.`;

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
      console.error("Cloudflare AI error:", cfRes.status, errBody);

      if (cfRes.status === 429) {
        return res.status(429).json({
          error: "Cloudflare free tier daily limit reached. Try again tomorrow or upload a photo instead!",
          prompt
        });
      }
      throw new Error(`Cloudflare AI returned ${cfRes.status}: ${errBody}`);
    }

    const data = await cfRes.json();
    const imageBase64 = data?.result?.image;

    if (!imageBase64) {
      throw new Error("No image data was returned from Cloudflare FLUX.");
    }

    return res.status(200).json({
      success: true,
      base64: imageBase64,
      mimeType: "image/png",
      prompt
    });
  } catch (err) {
    console.error("AI Image Generation Error:", err);
    return res.status(500).json({
      error: err.message || "Failed to generate food photo.",
      prompt,
      details: err.toString()
    });
  }
}
