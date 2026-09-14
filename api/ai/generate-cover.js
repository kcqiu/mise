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

    // Attempt Imagen 3 Generation
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: "1:1",
        outputMimeType: "image/jpeg"
      }
    });

    const generatedImage = response.generatedImages?.[0];
    const imageBytes = generatedImage?.image?.imageBytes;

    if (!imageBytes) {
      throw new Error("No image data was returned from the image generation model.");
    }

    return res.status(200).json({
      success: true,
      base64: imageBytes,
      mimeType: "image/jpeg",
      prompt
    });
  } catch (err) {
    console.error("AI Image Generation Error:", err);
    return res.status(500).json({
      error: err.message || "Failed to generate realistic food photo with Gemini Imagen.",
      prompt,
      details: err.toString()
    });
  }
}
