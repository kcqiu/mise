/**
 * Gemini AI Recipe Assistant & Media Generation
 *
 * Provides client-side hooks to communicate with the Vercel AI Serverless endpoints:
 * 1. Multi-source intake: Photo OCR, unstructured text, recipe websites, and social media (TikTok/IG/YT).
 * 2. Mandatory and on-demand recipe polishing and standardization.
 * 3. Photorealistic food photography generation using Gemini Imagen 3, synced to Supabase Storage.
 */

import { uploadRecipeCover } from "./cloud";

/**
 * Constructs an optimized food photography prompt for Gemini Image Generation.
 * @param {Object} recipe
 * @returns {string}
 */
export function buildGeminiCoverPrompt(recipe) {
  const keyIngredients = (recipe.ingredients || [])
    .map((i) => (typeof i === "string" ? i : i.name))
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");

  const cuisine = recipe.cuisine ? `${recipe.cuisine} style` : "gourmet";

  return `Professional, high-end culinary food photograph of ${recipe.title || "a homemade dish"}, ${cuisine}. ${
    recipe.description ? recipe.description + "." : ""
  } Featuring: ${keyIngredients || "fresh seasonal ingredients"}. Beautifully plated on rustic ceramic, natural soft warm lighting, steam gently rising, symmetrical composition, shallow depth of field, editorial food magazine style, photorealistic, 8k resolution.`;
}

/**
 * Helper to execute an AI API endpoint with user-friendly error normalization.
 */
async function callAiEndpoint(endpoint, payload) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (data?.missingKey) {
      throw new Error(
        "Gemini API key is not configured. Please add GEMINI_API_KEY in your Vercel Project Environment Variables to enable AI capabilities."
      );
    }
    throw new Error(data?.error || `AI operation failed (${response.status})`);
  }

  return data;
}

/**
 * Parses raw text or rough cooking notes into a standardized MISE recipe schema.
 * @param {string} text
 * @returns {Promise<Object>} Structured recipe
 */
export async function parseRecipeFromText(text) {
  const data = await callAiEndpoint("/api/ai/parse-recipe", {
    mode: "text",
    text,
  });
  return data.recipe;
}

/**
 * Scans a cookbook page, handwritten recipe card, or photo of a dish.
 * @param {File|Blob|string} imageFileOrBase64
 * @param {string} [mimeType="image/jpeg"]
 * @returns {Promise<Object>} Structured recipe
 */
export async function parseRecipeFromPhoto(imageFileOrBase64, mimeType = "image/jpeg") {
  let base64 = "";
  if (typeof imageFileOrBase64 === "string") {
    base64 = imageFileOrBase64;
  } else if (imageFileOrBase64 instanceof Blob) {
    base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(imageFileOrBase64);
    });
    mimeType = imageFileOrBase64.type || mimeType;
  }

  const data = await callAiEndpoint("/api/ai/parse-recipe", {
    mode: "photo",
    image: base64,
    mimeType,
  });
  return data.recipe;
}

/**
 * Imports a recipe from an external website URL.
 * Serverless proxy fetches HTML, bypasses CORS, and extracts schema.org/Recipe or main text.
 * @param {string} url
 * @returns {Promise<Object>} Structured recipe
 */
export async function parseRecipeFromUrl(url) {
  const data = await callAiEndpoint("/api/ai/parse-recipe", {
    mode: "url",
    url,
  });
  return data.recipe;
}

/**
 * Extracts a recipe from a TikTok, Instagram, or YouTube link.
 * Extracts video title, creator, caption, and thumbnail, and preserves the embed URL.
 * @param {string} url
 * @returns {Promise<Object>} Structured recipe
 */
export async function parseRecipeFromSocial(url) {
  const data = await callAiEndpoint("/api/ai/parse-recipe", {
    mode: "social",
    url,
  });
  return data.recipe;
}

/**
 * Polishes and standardizes a manual or draft recipe.
 * Standardizes units, formats ingredient groups, injects sensory step cues, and fills in missing estimates.
 * @param {Object} recipe
 * @returns {Promise<Object>} Polished recipe
 */
export async function enhanceRecipeWithGemini(recipe) {
  const data = await callAiEndpoint("/api/ai/polish-recipe", {
    recipe,
  });
  return data.recipe;
}

/**
 * Generates a realistic editorial food photograph for a dish using Gemini Imagen 3.
 * If userId is provided, uploads the image to Supabase Storage CDN and returns the public CDN URL.
 * Otherwise returns a base64 data URL.
 * @param {Object} recipe
 * @param {{ userId?: string, recipeId?: string }} [options={}]
 * @returns {Promise<string>} Cover photo URL
 */
export async function generateRecipeCoverWithGemini(recipe, options = {}) {
  const data = await callAiEndpoint("/api/ai/generate-cover", {
    recipe,
  });

  if (!data?.base64) {
    throw new Error("No image data received from Gemini Imagen.");
  }

  const mimeType = data.mimeType || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${data.base64}`;

  // If user is authenticated and cloud-enabled, upload to Supabase Storage CDN
  if (options.userId) {
    try {
      const byteCharacters = atob(data.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });

      const uploadedUrl = await uploadRecipeCover(
        blob,
        options.recipeId || `gen-${Date.now()}`,
        options.userId
      );
      if (uploadedUrl) return uploadedUrl;
    } catch (uploadErr) {
      console.warn("Could not upload AI image to Supabase Storage, using data URL fallback:", uploadErr);
    }
  }

  return dataUrl;
}
