import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "Gemini API key is not configured. Please add GEMINI_API_KEY in your Vercel Project Environment Variables.",
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
    const ai = new GoogleGenAI({ apiKey });

    // Use the most cost-efficient image model: gemini-3.1-flash-lite-image
    let imageBytes = null;
    let mimeType = "image/jpeg";

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: prompt
      });
      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (part?.inlineData?.data) {
        imageBytes = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/jpeg";
      }
    } catch (modelErr) {
      if (
        modelErr.message?.includes("limit: 0") ||
        modelErr.message?.includes("RESOURCE_EXHAUSTED") ||
        modelErr.message?.includes("429")
      ) {
        return res.status(429).json({
          error:
            "Gemini image generation requires a Google Cloud / AI Studio project with pay-as-you-go billing enabled. (Google offers free tier for recipe text & photo parsing, but restricts image generation models to billing-enabled accounts). You can upload a photo or paste an image URL for free!",
          billingRequired: true,
          prompt
        });
      }
      throw modelErr;
    }

    if (!imageBytes) {
      throw new Error("No image data was returned from the Gemini image model.");
    }

    return res.status(200).json({
      success: true,
      base64: imageBytes,
      mimeType,
      prompt
    });
  } catch (err) {
    console.error("AI Image Generation Error:", err);
    return res.status(500).json({
      error: err.message || "Failed to generate realistic food photo with Gemini.",
      prompt,
      details: err.toString()
    });
  }
}
