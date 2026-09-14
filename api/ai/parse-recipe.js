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

const SYSTEM_INSTRUCTION = `You are MISE, an elite culinary chef and recipe intelligence assistant.
Your task is to parse unstructured input (photos, rough text, website content, or social media video descriptions) into a clean, professional, standardized recipe JSON.

Rules:
1. Always structure ingredients cleanly:
   - "name": Just the ingredient name (e.g. "kosher salt", "heavy cream", "shallot").
   - "quantity": A pure float or integer (e.g. 1.5, 2, 0.25). Convert fractions like "1/2" to 0.5. If unknown, use null.
   - "unit": Standard abbreviated unit: "tbsp", "tsp", "cup", "oz", "lb", "g", "kg", "ml", "pinch", "cloves", "stalks", "slices", or empty string.
   - "note": Preparations like "diced", "at room temperature", "cold", "to taste".
   - "group": If the recipe has multiple parts (e.g. "Sauce", "Salad", "Marinade", "Dough"), group them accordingly.
2. Steps must be clear, chronological, and sensory:
   - Provide a short 2-4 word action "title" for each step.
   - Include sensory cues in "instruction" (visual changes, smells, sizzle, textures, safe temperatures).
3. If prepMinutes or cookMinutes are omitted in the source, infer reasonable culinary estimates.
4. Ensure category is one of: Dinner, Breakfast, Baking, Mains, Sides, Desserts, Drinks, Lunch, Salads, Soups.
5. Return strictly valid JSON conforming to the schema.`;

async function fetchWebsiteData(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website (${response.status} ${response.statusText})`);
  }

  const html = await response.text();

  // 1. Extract JSON-LD (Schema.org Recipe)
  const jsonLdRegex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let recipeSchemaData = null;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      const recipeItem = items.find((item) => item["@type"] === "Recipe" || (Array.isArray(item["@type"]) && item["@type"].includes("Recipe")));
      if (recipeItem) {
        recipeSchemaData = recipeItem;
        break;
      }
    } catch {
      // Ignore malformed JSON-LD scripts
    }
  }

  // 2. Extract OpenGraph metadata
  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i)?.[1] || "";
  const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i)?.[1] || "";
  const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i)?.[1] || "";

  // 3. Clean readable text
  const cleanBody = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);

  return {
    recipeSchemaData,
    ogTitle,
    ogImage,
    ogDesc,
    cleanBody
  };
}

async function fetchSocialData(url) {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();

  let title = "";
  let author = "";
  let thumbnail = "";
  let caption = "";

  if (host === "youtube.com" || host === "youtu.be") {
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || "";
        author = data.author_name || "";
        thumbnail = data.thumbnail_url || "";
      }
    } catch {
      // Continue to body fetch
    }
  } else if (host === "tiktok.com") {
    try {
      const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        title = data.title || "";
        author = data.author_name || "";
        thumbnail = data.thumbnail_url || "";
      }
    } catch {
      // Continue
    }
  }

  // Also fetch page metadata if caption is empty
  try {
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      }
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      caption =
        html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i)?.[1] ||
        html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i)?.[1] || "";
      if (!thumbnail) {
        thumbnail = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i)?.[1] || "";
      }
      if (!title) {
        title = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i)?.[1] || "";
      }
    }
  } catch {
    // Non-fatal
  }

  return { title, author, thumbnail, caption, host };
}

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
  const { mode, text, image, mimeType, url } = body;

  try {
    const ai = new GoogleGenAI({ apiKey });
    let contents = [];
    let discoveredArtwork = "";
    let canonicalVideoUrl = "";

    if (mode === "text") {
      if (!text || !text.trim()) {
        return res.status(400).json({ error: "Please provide recipe text or ingredients to parse." });
      }
      contents = [
        SYSTEM_INSTRUCTION,
        `Parse the following raw text or notes into a structured culinary recipe:\n\n${text.trim()}`
      ];
    } else if (mode === "photo") {
      if (!image) {
        return res.status(400).json({ error: "Please provide a base64 encoded photo to scan." });
      }
      const rawBase64 = image.includes(",") ? image.split(",")[1] : image;
      contents = [
        SYSTEM_INSTRUCTION,
        "Analyze this recipe image, cookbook page, handwritten card, or plated dish. Extract all ingredients and cooking instructions into a standardized culinary recipe.",
        {
          inlineData: {
            data: rawBase64,
            mimeType: mimeType || "image/jpeg"
          }
        }
      ];
    } else if (mode === "url") {
      if (!url || !url.trim()) {
        return res.status(400).json({ error: "Please provide a valid recipe website URL." });
      }
      const webData = await fetchWebsiteData(url.trim());
      if (webData.ogImage) discoveredArtwork = webData.ogImage;

      const payloadDesc = webData.recipeSchemaData
        ? `Found Schema.org Recipe Data:\n${JSON.stringify(webData.recipeSchemaData, null, 2)}\n\nPage Text Preview:\n${webData.cleanBody.slice(0, 4000)}`
        : `Page Title: ${webData.ogTitle}\nPage Description: ${webData.ogDesc}\n\nPage Text:\n${webData.cleanBody}`;

      contents = [
        SYSTEM_INSTRUCTION,
        `Extract the complete recipe from this website content (URL: ${url}):\n\n${payloadDesc}`
      ];
    } else if (mode === "social") {
      if (!url || !url.trim()) {
        return res.status(400).json({ error: "Please provide a social media video link." });
      }
      const socialData = await fetchSocialData(url.trim());
      canonicalVideoUrl = url.trim();
      if (socialData.thumbnail) discoveredArtwork = socialData.thumbnail;

      contents = [
        SYSTEM_INSTRUCTION,
        `Extract the culinary recipe from this social media post (${socialData.host}):
Title: ${socialData.title}
Creator: ${socialData.author}
Caption / Description: ${socialData.caption || "None provided"}
Video URL: ${url}

If the caption does not list every step explicitly, use your culinary knowledge of the dish mentioned in the title/caption to reconstruct the complete, authentic step-by-step cooking instructions.`
      ];
    } else {
      return res.status(400).json({ error: `Unsupported mode: '${mode}'. Use 'text', 'photo', 'url', or 'social'.` });
    }

    // Call Gemini API with the most cost-efficient model (gemini-3.5-flash-lite)
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RECIPE_SCHEMA
      }
    });

    const parsedText = response.text || "{}";
    const recipeData = JSON.parse(parsedText);

    // Attach supplementary metadata
    if (!recipeData.artwork && discoveredArtwork) {
      recipeData.artwork = discoveredArtwork;
    }
    if (!recipeData.sourceVideo && canonicalVideoUrl) {
      recipeData.sourceVideo = canonicalVideoUrl;
    }

    return res.status(200).json({
      success: true,
      recipe: recipeData
    });
  } catch (err) {
    console.error("AI Parse Error:", err);
    return res.status(500).json({
      error: err.message || "Failed to analyze recipe with Gemini AI.",
      details: err.toString()
    });
  }
}
