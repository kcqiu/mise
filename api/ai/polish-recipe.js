import { GoogleGenAI } from "@google/genai";

const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Concise, appealing recipe title" },
    description: { type: "string", description: "1-2 sentence appetizing description" },
    category: {
      type: "string",
      description: "One of: Dinner, Breakfast, Baking, Mains, Sides, Desserts, Drinks, Lunch, Salads, Soups"
    },
    cuisine: { type: "string", description: "Culinary style or origin, e.g. Italian, Mexican, Japanese, French, American" },
    method: { type: "string", description: "Primary cooking method, e.g. Pan-sear, Bake, Roast, Stir-fry, Braise" },
    prepMinutes: { type: "integer", description: "Preparation time in minutes" },
    cookMinutes: { type: "integer", description: "Active cooking time in minutes" },
    restMinutes: { type: "integer", description: "Resting or cooling time in minutes (0 if none)" },
    servings: { type: "integer", description: "Number of servings (e.g. 2, 4, 6)" },
    tags: { type: "array", items: { type: "string" }, description: "Tags e.g. Quick, Gluten-Free, Weeknight" },
    keywords: { type: "array", items: { type: "string" }, description: "Search keywords" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Core ingredient name only (e.g. 'unsalted butter', 'garlic')" },
          quantity: { type: "number", description: "Numeric amount (e.g. 2, 0.5) or null" },
          unit: { type: "string", description: "Standard measurement unit (e.g. tbsp, tsp, cup, oz, g, cloves) or empty" },
          note: { type: "string", description: "Preparation note (e.g. 'finely minced', 'melted', 'room temperature')" },
          group: { type: "string", description: "Component group if any, e.g. 'Dressing', 'Marinade', 'Main', or empty" }
        },
        required: ["name"]
      }
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short 2-4 word step title, e.g. 'Sear the beef', 'Emulsify sauce'" },
          instruction: { type: "string", description: "Clear, concise instructions with sensory cues (color, sizzle, temperature)" }
        },
        required: ["instruction"]
      }
    },
    notes: { type: "array", items: { type: "string" }, description: "Chef notes or critical tips" },
    substitutions: { type: "array", items: { type: "string" }, description: "Substitutions for key ingredients" },
    equipment: { type: "array", items: { type: "string" }, description: "Specialty equipment needed, e.g. Cast iron skillet" }
  },
  required: ["title", "category", "ingredients", "steps"]
};

const POLISH_SYSTEM_PROMPT = `You are MISE Chef Editor, a world-class culinary editor and chef.
Your task is to review and polish the user's recipe draft to executive culinary publication standards while strictly respecting their recipe concept.

Refinement Objectives:
1. Standardize Measurements:
   - Convert colloquial or spelled-out units (Tablespoon -> tbsp, teaspoon -> tsp, ounce -> oz, gram -> g).
   - Convert textual fractions (1/2 -> 0.5, 1/4 -> 0.25).
2. Clean Ingredient Nomenclature:
   - Separate the base ingredient ("yellow onion") from prep state ("diced 1/4-inch" -> note).
   - Separate groupings if the dish has distinct components (e.g., "Dressing", "Sauce", "Marinade", "Dough", "Garnish").
3. Elevate Cooking Instructions:
   - Ensure every step has an evocative, concise 2-4 word action title.
   - Inject sensory cues: what should the cook hear (gentle sizzle), see (deep golden crust, glossy emulsion), or feel (firm to the touch)?
   - Specify ideal pans or temperatures where appropriate.
4. Fill in Missing Estimates:
   - If prepMinutes or cookMinutes are 0 or unreasonable, provide realistic estimates.
   - Suggest 2-4 helpful tags (e.g., "Gluten-Free", "One-Pan", "30-Minute").
   - Suggest essential equipment if none listed.
5. Retain Existing ID & Artwork:
   - Preserve original id, artwork, and sourceVideo from the input.
6. Output strictly valid JSON matching the schema.`;

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
    return res.status(400).json({ error: "A recipe object with at least a title is required." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        POLISH_SYSTEM_PROMPT,
        `Here is the recipe to review and polish:\n\n${JSON.stringify(recipe, null, 2)}`
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RECIPE_SCHEMA
      }
    });

    const parsed = JSON.parse(response.text || "{}");

    // Preserve original fields if missing from response
    const polishedRecipe = {
      ...recipe,
      ...parsed,
      id: recipe.id || parsed.id,
      artwork: recipe.artwork || parsed.artwork || "",
      sourceVideo: recipe.sourceVideo || parsed.sourceVideo || "",
      ingredients: (parsed.ingredients || recipe.ingredients).map((item, idx) => ({
        ...item,
        id: item.id || `ingredient-${idx}`,
        quantity: item.quantity != null && !isNaN(Number(item.quantity)) ? Number(item.quantity) : null,
        unit: item.unit || "",
        note: item.note || "",
        group: item.group || ""
      })),
      steps: (parsed.steps || recipe.steps).map((step, idx) => ({
        ...step,
        id: step.id || `step-${idx}`,
        title: step.title || `Step ${idx + 1}`,
        instruction: step.instruction || ""
      }))
    };

    return res.status(200).json({
      success: true,
      recipe: polishedRecipe
    });
  } catch (err) {
    console.error("AI Polish Error:", err);
    return res.status(500).json({
      error: err.message || "Failed to polish recipe with Gemini AI.",
      details: err.toString()
    });
  }
}
