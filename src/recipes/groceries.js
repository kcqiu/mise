/**
 * Groceries Engine for MISE
 * 
 * 100% Deterministic, pure-function grocery list domain engine:
 * - Stable canonical grocery item identities (food:<lemma>[:<sorted-explicit-modifiers>])
 * - Non-inferential ingredient normalization (milk remains food:milk, not food:milk:whole)
 * - Separation of product identity from quantity compatibility (head vs cloves group under food:garlic with discrete requirements)
 * - Explicit culinary modifiers & conservative synonym handling (green onion <-> scallion)
 * - Compatible-unit aggregation using standard culinary measurements
 * - Non-shopping utility suppression (water, ice)
 * - Session-scoped item overrides (checked, dismissed tombstones, pantry promotions)
 * - Custom item UUID identities and persistent deletion tombstones
 * - Session reset and rollover transformation for unchecked items into standalone custom items
 */

import { formatQuantityFraction } from "./units";

export const STORAGE_KEY_GROCERIES = "mise-groceries-v1";
export const STORAGE_PREFIX_GROCERY_SESSION = "mise-grocery-session";
export const STORAGE_PREFIX_GROCERY_QUEUE = "mise-grocery-queue";
export const STORAGE_PREFIX_AISLE_ORDER = "mise-aisle-order";

/**
 * Robust UUID v4 generator for client sessions and mutations.
 */
export function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const EMPTY_GROCERY_SESSION = {
  id: "00000000-0000-0000-0000-000000000000",
  status: "active", // "active" | "completed"
  startedAt: 0,
  updatedAt: 0,
  completedAt: null,
  revision: 1,
  recipes: [], // Array<{ recipeId: string, servings: number, addedAt: number }>
  customItems: [], // Array<{ id: string, name: string, quantity: number|null, unit: string, category: string, note: string, status: "unchecked"|"checked"|"dismissed", updatedAt: number }>
  itemOverrides: {}, // Record<itemKey, { status: "unchecked"|"checked"|"dismissed", isPantryPromoted?: boolean, updatedAt: number }>
};

// --- Non-shopping Utilities (filtered out entirely) ---
const NON_SHOPPING_UTILITIES = new Set([
  "water",
  "tap water",
  "cold water",
  "warm water",
  "hot water",
  "boiling water",
  "ice water",
  "ice",
  "ice cubes",
  "crushed ice",
]);

// --- Pantry Staples (isolated to collapsible drawer unless promoted) ---
const PANTRY_STAPLES = new Set([
  "salt",
  "kosher salt",
  "table salt",
  "sea salt",
  "fine sea salt",
  "flaky sea salt",
  "black pepper",
  "ground black pepper",
  "freshly ground black pepper",
  "black peppercorns",
  "pepper",
  "olive oil",
  "extra virgin olive oil",
  "extra-virgin olive oil",
  "vegetable oil",
  "canola oil",
  "neutral oil",
  "cooking spray",
]);

// --- Significant Culinary Distinctions (Explicit Modifiers) ---
// Modifiers that define a fundamentally different grocery product.
// Normalization preserves these when explicitly present, but NEVER infers them when absent.
const DISTINCT_MODIFIERS = new Set([
  // Dairy / milk variants
  "unsalted",
  "salted",
  "heavy",
  "whipping",
  "sour",
  "evaporated",
  "condensed",
  "whole",
  "skim",
  "low-fat",
  "nonfat",
  "2-percent",
  "1-percent",
  "oat",
  "almond",
  "soy",
  "coconut",
  "cashew",
  // Poultry cuts
  "breast",
  "thigh",
  "wing",
  "drumstick",
  "tender",
  "tenderloin",
  // Meat cuts & form
  "ground",
  "ribeye",
  "sirloin",
  "flank",
  "brisket",
  "chuck",
  "loin",
  "belly",
  // Specific varieties / varieties of onions, vinegars, sugars
  "red",
  "yellow",
  "white",
  "sweet",
  "dark",
  "light",
  "all-purpose",
  "bread",
  "cake",
  "brown",
  "powdered",
  "granulated",
  "balsamic",
  "apple-cider",
  "rice",
  "dijon",
  "kosher",
]);

// Cut modifiers that naturally appear after the protein in English (e.g. Chicken Breast, Beef Ribeye)
const CUT_MODIFIERS = new Set([
  "breast",
  "thigh",
  "wing",
  "drumstick",
  "tender",
  "tenderloin",
  "ribeye",
  "sirloin",
  "flank",
  "brisket",
  "chuck",
  "loin",
  "belly",
]);

// Standard Volume Factors to base mL
const VOLUME_FACTORS_ML = {
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  tbsp: 15,
  tbs: 15,
  tablespoon: 15,
  tablespoons: 15,
  "fl oz": 30,
  "fluid ounce": 30,
  "fluid ounces": 30,
  cup: 240,
  cups: 240,
  c: 240,
  pt: 480,
  pint: 480,
  pints: 480,
  qt: 960,
  quart: 960,
  quarts: 960,
  gal: 3840,
  gallon: 3840,
  gallons: 3840,
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
};

// Standard Weight Factors to base grams
const WEIGHT_FACTORS_G = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
};

// Conservative Synonyms Map
// Only maps terms that undeniably refer to the same grocery shelf product.
const SYNONYM_MAP = {
  "green onion": "scallion",
  "green onions": "scallion",
  "spring onion": "scallion",
  "spring onions": "scallion",
  scallions: "scallion",
  garlics: "garlic",
  "garlic cloves": "garlic",
  "garlic clove": "garlic",
  "cloves garlic": "garlic",
  "clove garlic": "garlic",
  "clove of garlic": "garlic",
  "cloves of garlic": "garlic",
  "head of garlic": "garlic",
  "heads of garlic": "garlic",
};

/**
 * Normalizes string by trimming, lowercasing, and removing accents.
 */
export function cleanText(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Basic English singularization for common culinary produce and proteins.
 */
export function singularizeLemma(word) {
  const w = cleanText(word);
  if (!w) return "";

  if (SYNONYM_MAP[w]) return SYNONYM_MAP[w];

  if (w.endsWith("potatoes")) return w.slice(0, -2);
  if (w.endsWith("tomatoes")) return w.slice(0, -2);
  if (w.endsWith("onions")) return w.slice(0, -1);
  if (w.endsWith("eggs")) return w.slice(0, -1);
  if (w.endsWith("cloves")) return w.slice(0, -1);
  if (w.endsWith("leaves")) return w.slice(0, -3) + "f";
  if (w.endsWith("berries")) return w.slice(0, -3) + "y";
  if (w.endsWith("avocados")) return w.slice(0, -1);
  if (w.endsWith("carrots")) return w.slice(0, -1);
  if (w.endsWith("lemons")) return w.slice(0, -1);
  if (w.endsWith("limes")) return w.slice(0, -1);
  if (w.endsWith("shallots")) return w.slice(0, -1);
  if (w.endsWith("steaks")) return w.slice(0, -1);
  if (w.endsWith("breasts")) return w.slice(0, -1);
  if (w.endsWith("thighs")) return w.slice(0, -1);
  if (w.endsWith("buns")) return w.slice(0, -1);
  if (w.endsWith("rolls")) return w.slice(0, -1);
  if (w.endsWith("tortillas")) return w.slice(0, -1);

  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) {
    return w.slice(0, -1);
  }

  return w;
}

/**
 * Checks if an ingredient is water or ice (non-shopping utility).
 */
export function isNonShoppingUtility(rawName) {
  const norm = cleanText(rawName);
  return NON_SHOPPING_UTILITIES.has(norm);
}

/**
 * Checks if an ingredient is an everyday pantry staple (salt, black pepper, cooking oil).
 */
export function isPantryStaple(rawName) {
  const norm = cleanText(rawName);
  return PANTRY_STAPLES.has(norm);
}

/**
 * Non-inferential ingredient detail parsing:
 * - Strips packaging/partitive prefixes (head of, clove of, can of)
 * - Extracts kitchen prep instructions into notes (diced, sliced, minced)
 * - Identifies explicit culinary modifiers without inventing missing ones
 * - Preserves unmodified ingredients (milk stays milk; never promoted to whole milk)
 */
export function parseIngredientDetails(rawName, rawNote = "") {
  let name = cleanText(rawName);
  let extractedNote = cleanText(rawNote);

  // Extract parenthesized notes: e.g. "yellow onion (diced)"
  const parenMatch = name.match(/^(.*?)\s*\((.*?)\)\s*$/);
  if (parenMatch) {
    name = parenMatch[1].trim();
    if (!extractedNote) extractedNote = parenMatch[2].trim();
  }

  // Extract comma-separated prep notes: e.g. "yellow onion, finely diced"
  const commaIndex = name.indexOf(",");
  if (commaIndex > 0) {
    const trailing = name.slice(commaIndex + 1).trim();
    name = name.slice(0, commaIndex).trim();
    if (!extractedNote) extractedNote = trailing;
  }

  // Strip packaging/partitive prefixes
  name = name.replace(/^(can|cans|bunch|bunches|head|heads|stalk|stalks|pinch|pinches|clove|cloves|bulb|bulbs)\s+of\s+/, "");

  // Normalize percentage representations (e.g. 2% milk -> 2-percent milk, 1% milk -> 1-percent milk)
  name = name.replace(/\b2\s*%/g, "2-percent").replace(/\b1\s*%/g, "1-percent");

  // Check synonym map before tokenization for compound terms
  if (SYNONYM_MAP[name]) {
    name = SYNONYM_MAP[name];
  }

  const rawTokens = name.split(/\s+/).filter(Boolean);
  const foundModifiers = [];
  const baseTokens = [];

  rawTokens.forEach((token) => {
    const sing = singularizeLemma(token);
    if (DISTINCT_MODIFIERS.has(token) || DISTINCT_MODIFIERS.has(sing)) {
      foundModifiers.push(DISTINCT_MODIFIERS.has(token) ? token : sing);
    } else {
      baseTokens.push(token);
    }
  });

  let rawLemma = baseTokens.join(" ");
  if (SYNONYM_MAP[rawLemma]) {
    rawLemma = SYNONYM_MAP[rawLemma];
  }
  const lemma = singularizeLemma(rawLemma) || rawLemma;

  // Pretty display name: prefix adjectives before lemma, cut modifiers after protein lemma
  const prefixMods = foundModifiers.filter((m) => !CUT_MODIFIERS.has(m));
  const postfixMods = foundModifiers.filter((m) => CUT_MODIFIERS.has(m));
  const displayName = toTitleCase(
    `${prefixMods.join(" ")} ${lemma} ${postfixMods.join(" ")}`.trim()
  );

  return {
    rawName,
    lemma,
    modifiers: foundModifiers,
    displayName,
    note: extractedNote,
  };
}

function toTitleCase(str) {
  return str
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

/**
 * Derives a stable canonical identity key for a grocery product.
 * 
 * CRITICAL INVARIANTS:
 * - Must strictly be food:<base_lemma>[:<sorted-modifiers>]
 * - MUST NEVER contain units, quantities, categories, preparation notes, recipe IDs, or session IDs.
 * - Non-inferential: "milk" -> "food:milk", "whole milk" -> "food:milk:whole".
 */
export function getCanonicalItemKey(parsedItem) {
  const lemma = (parsedItem.lemma || "").replace(/[^a-z0-9]/g, "-");
  const mods = (parsedItem.modifiers || [])
    .slice()
    .sort()
    .map((m) => m.replace(/[^a-z0-9]/g, "-"))
    .filter(Boolean);

  if (mods.length > 0) {
    return `food:${lemma}:${mods.join(":")}`;
  }
  return `food:${lemma}`;
}

/**
 * Categorizes an ingredient into standard supermarket aisles.
 * Aisle categorization is purely a derived presentation-layer grouping.
 */
export function categorizeAisle(rawName, customGroup = "") {
  const name = cleanText(rawName);
  const group = cleanText(customGroup);

  if (group.includes("produce") || group.includes("vegetable") || group.includes("fruit")) return "Produce";
  if (group.includes("meat") || group.includes("seafood") || group.includes("fish") || group.includes("poultry")) return "Meat & Seafood";
  if (group.includes("dairy") || group.includes("cheese")) return "Dairy & Refrigerated";
  if (group.includes("bakery") || group.includes("bread")) return "Bakery & Bread";
  if (group.includes("spice") || group.includes("seasoning")) return "Spices & Seasonings";

  // Produce
  if (
    /\b(onion|garlic|shallot|ginger|scallion|leek|potato|carrot|celery|tomato|avocado|lemon|lime|apple|banana|berr|lettuce|cabbage|spinach|kale|arugula|cucumber|zucchini|mushroom|pepper|chili|jalapeno|herb|cilantro|basil|parsley|mint|rosemary|thyme|dill|sage|tarragon|corn|squash|eggplant|broccoli|cauliflower|asparagus)/.test(
      name
    )
  ) {
    return "Produce";
  }

  // Meat & Seafood
  if (
    /\b(chicken|beef|steak|ribeye|pork|bacon|pancetta|guanciale|sausage|prosciutto|turkey|lamb|duck|salmon|tuna|cod|halibut|shrimp|prawn|lobster|crab|scallop|anchov|clam|mussel)/.test(
      name
    )
  ) {
    return "Meat & Seafood";
  }

  // Dairy & Refrigerated
  if (
    /\b(milk|butter|cream|cream cheese|cheese|cheddar|parmesan|mozzarella|pecorino|feta|ricotta|brie|gouda|egg|yogurt|tofu)/.test(
      name
    )
  ) {
    return "Dairy & Refrigerated";
  }

  // Bakery & Bread
  if (/\b(bread|baguette|sourdough|brioche|roll|bun|tortilla|pita|croissant|crust)/.test(name)) {
    return "Bakery & Bread";
  }

  // Oils, Vinegars & Condiments
  if (
    /\b(oil|vinegar|balsamic|soy sauce|tamari|fish sauce|mayo|mayonnaise|mustard|ketchup|hot sauce|sriracha|honey|maple syrup|worcestershire)/.test(
      name
    )
  ) {
    return "Oils & Condiments";
  }

  // Spices & Seasonings
  if (
    /\b(salt|pepper|peppercorn|cumin|paprika|oregano|cinnamon|nutmeg|cardamom|turmeric|coriander|curry powder|vanilla|extract|bay lea)/.test(
      name
    )
  ) {
    return "Spices & Seasonings";
  }

  // Frozen
  if (/\b(frozen|puff pastry|ice cream|sorbet|phyllo)/.test(name)) {
    return "Frozen";
  }

  // Pantry & Dry Goods
  if (
    /\b(pasta|noodle|spaghetti|fettuccine|penne|rigatoni|rice|grain|quinoa|couscous|flour|sugar|baking powder|baking soda|yeast|bean|chickpea|lentil|broth|stock|bouillon|tomato paste|canned|nut|almond|walnut|pecan|peanut|seed|chocolate|cocoa)/.test(
      name
    )
  ) {
    return "Pantry & Dry Goods";
  }

  return "Pantry & Dry Goods";
}

/**
 * Normalizes unit string for plural/singular equivalence matching (e.g. clove/cloves, head/heads, bunch/bunches).
 */
export function normalizeUnit(unitStr) {
  const s = cleanText(unitStr).replace(/[.]/g, "");
  if (!s) return "";
  if (s.endsWith("es") && (s.endsWith("ches") || s.endsWith("shes") || s.endsWith("xes"))) {
    return s.slice(0, -2);
  }
  if (s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us") && !s.endsWith("is")) {
    return s.slice(0, -1);
  }
  return s;
}

/**
 * Aggregates multiple ingredient contributions under a shared product identity.
 * 
 * CORE PRINCIPLE: Identity compatibility does not imply quantity compatibility.
 * - Compatible units (e.g. cups + mL, or grams + oz, or identical count) are mathematically summed.
 * - Incompatible purchasing dimensions (e.g. 1 head + 3 cloves, or bunch + grams) do NOT force lossy conversion.
 *   Instead, they render discrete requirement lines under the single product identity.
 */
export function aggregateContributions(contributions) {
  if (!contributions || !contributions.length) {
    return {
      isCompatibleQuantity: true,
      quantity: null,
      unit: "",
      quantityText: "",
      requirements: [],
    };
  }

  const withNumeric = contributions.filter((c) => typeof c.quantity === "number");
  if (!withNumeric.length) {
    return {
      isCompatibleQuantity: true,
      quantity: null,
      unit: contributions[0]?.unit || "",
      quantityText: "",
      requirements: [],
    };
  }

  const rawUnitsClean = withNumeric.map((c) => cleanText(c.unit).replace(/[.]/g, ""));
  const normUnits = withNumeric.map((c) => normalizeUnit(c.unit));
  const allVolume = rawUnitsClean.every((u) => VOLUME_FACTORS_ML[u]);
  const allWeight = rawUnitsClean.every((u) => WEIGHT_FACTORS_G[u]);
  const allSame = normUnits.every((u) => u === normUnits[0]);

  // Case 1: All Volume
  if (allVolume) {
    let totalMl = 0;
    withNumeric.forEach((c) => {
      const u = cleanText(c.unit).replace(/[.]/g, "");
      totalMl += c.quantity * (VOLUME_FACTORS_ML[u] || 1);
    });

    let finalQty;
    let finalUnit;
    if (totalMl < 15) {
      finalQty = totalMl / 5;
      finalUnit = "tsp";
    } else if (totalMl < 60) {
      finalQty = totalMl / 15;
      finalUnit = "tbsp";
    } else {
      finalQty = totalMl / 240;
      finalUnit = finalQty <= 1 ? "cup" : "cups";
    }

    const qtyStr = formatQuantityFraction(finalQty);
    return {
      isCompatibleQuantity: true,
      quantity: finalQty,
      unit: finalUnit,
      quantityText: `${qtyStr} ${finalUnit}`,
      requirements: [],
    };
  }

  // Case 2: All Weight
  if (allWeight) {
    let totalG = 0;
    withNumeric.forEach((c) => {
      const u = cleanText(c.unit).replace(/[.]/g, "");
      totalG += c.quantity * (WEIGHT_FACTORS_G[u] || 1);
    });

    let finalQty;
    let finalUnit;
    if (totalG >= 450) {
      finalQty = totalG / 453.6;
      finalUnit = "lb";
    } else {
      finalQty = totalG;
      finalUnit = "g";
    }

    const qtyStr = formatQuantityFraction(finalQty);
    return {
      isCompatibleQuantity: true,
      quantity: finalQty,
      unit: finalUnit,
      quantityText: `${qtyStr} ${finalUnit}`,
      requirements: [],
    };
  }

  // Case 3: Identical Units (e.g. all empty, all 'head', all 'clove', all 'bunch')
  if (allSame) {
    const totalQty = withNumeric.reduce((sum, c) => sum + c.quantity, 0);
    const qtyStr = formatQuantityFraction(totalQty);
    let unit = withNumeric[0].unit || "";
    const base = normUnits[0];
    if (base && totalQty > 1 && !unit.endsWith("s")) {
      unit = base.endsWith("ch") || base.endsWith("sh") ? `${base}es` : `${base}s`;
    }
    return {
      isCompatibleQuantity: true,
      quantity: totalQty,
      unit,
      quantityText: unit ? `${qtyStr} ${unit}` : qtyStr,
      requirements: [],
    };
  }

  // Case 4: Incompatible Dimensions (e.g. 1 head + 3 cloves, or bunch + grams)
  // Sub-aggregate contributions that share identical units, and list discrete requirement lines
  // ZERO conversion ratio is applied between incompatible units.
  const unitGroups = new Map();
  contributions.forEach((c) => {
    const u = normalizeUnit(c.unit);
    if (!unitGroups.has(u)) {
      unitGroups.set(u, {
        rawUnit: c.unit || "",
        normUnit: u,
        totalQty: 0,
        hasNumeric: false,
        recipes: [],
      });
    }
    const group = unitGroups.get(u);
    if (typeof c.quantity === "number") {
      group.totalQty += c.quantity;
      group.hasNumeric = true;
    }
    group.recipes.push(c.recipeTitle + (c.note ? ` (${c.note})` : ""));
  });

  const requirements = [];
  unitGroups.forEach((group) => {
    const qtyStr = group.hasNumeric ? formatQuantityFraction(group.totalQty) : "";
    let unitLabel = group.rawUnit;
    if (group.normUnit && group.totalQty > 1 && !unitLabel.endsWith("s")) {
      unitLabel = group.normUnit.endsWith("ch") || group.normUnit.endsWith("sh")
        ? `${group.normUnit}es`
        : `${group.normUnit}s`;
    }
    const qtyText = qtyStr ? (unitLabel ? `${qtyStr} ${unitLabel}` : qtyStr) : unitLabel;
    requirements.push({
      quantityText: qtyText,
      recipeTitle: group.recipes.join(", "),
      note: "",
    });
  });

  return {
    isCompatibleQuantity: false,
    quantity: null,
    unit: "",
    quantityText: "",
    requirements,
  };
}

/**
 * Pure Selector: Derives the active, consolidated grocery list from a canonical session and recipe library.
 * 
 * Guarantees:
 * - Keys are stable food:<lemma>[:<modifiers>]
 * - Checks persist across serving rescaling
 * - Unspecified variants (milk) never merge with explicit variants (whole milk)
 * - Incompatible dimensions group under one product with discrete requirement lines
 * - Session overrides are strictly scoped to the active session
 */
export function selectGroceryList(session, recipesLibrary, customAisleOrder = null) {
  const safeSession = session || EMPTY_GROCERY_SESSION;
  const recipeMap = new Map((recipesLibrary || []).map((r) => [r.id, r]));
  const itemOverrides = safeSession.itemOverrides || {};

  const aggregatedMap = new Map();

  // Active recipes list with resolved title and servings
  const activeRecipes = (safeSession.recipes || []).map((item) => {
    const full = recipeMap.get(item.recipeId);
    return {
      recipeId: item.recipeId,
      title: full ? full.title : "Custom Recipe",
      servings: item.servings || (full ? full.servings : 2),
      defaultServings: full ? full.servings : 2,
      artwork: full ? full.artwork : "",
      addedAt: item.addedAt || 0,
    };
  });

  // 1. Process all ingredients across active recipes
  (safeSession.recipes || []).forEach((sessionRecipe) => {
    const fullRecipe = recipeMap.get(sessionRecipe.recipeId);
    if (!fullRecipe || !Array.isArray(fullRecipe.ingredients)) return;

    const multiplier = (sessionRecipe.servings || fullRecipe.servings) / (fullRecipe.servings || 1);

    fullRecipe.ingredients.forEach((ing) => {
      if (!ing || !ing.name) return;

      // Filter non-shopping utilities (tap water, ice)
      if (isNonShoppingUtility(ing.name)) return;

      const parsed = parseIngredientDetails(ing.name, ing.note);
      const key = getCanonicalItemKey(parsed);

      // Check if dismissed via tombstone
      const override = itemOverrides[key];
      if (override && override.status === "dismissed") return;

      const aisle = categorizeAisle(ing.name, ing.group);
      const staple = isPantryStaple(ing.name);
      const scaledQty = typeof ing.quantity === "number" ? ing.quantity * multiplier : null;

      if (!aggregatedMap.has(key)) {
        aggregatedMap.set(key, {
          key,
          name: parsed.displayName,
          aisle,
          isPantryStaple: staple,
          isCustom: false,
          contributions: [],
          recipes: [],
        });
      }

      const entry = aggregatedMap.get(key);

      entry.contributions.push({
        quantity: scaledQty,
        unit: ing.unit || "",
        recipeId: fullRecipe.id,
        recipeTitle: fullRecipe.title,
        note: parsed.note || "",
      });

      entry.recipes.push({
        recipeId: fullRecipe.id,
        recipeTitle: fullRecipe.title,
        quantity: scaledQty,
        unit: ing.unit || "",
        note: parsed.note || "",
      });
    });
  });

  // 2. Finalize aggregated quantities & format display text
  const finalizedItems = [];

  aggregatedMap.forEach((entry) => {
    const agg = aggregateContributions(entry.contributions);
    const override = itemOverrides[entry.key];
    const isChecked = override ? override.status === "checked" : false;

    finalizedItems.push({
      key: entry.key,
      name: entry.name,
      aisle: entry.aisle,
      isPantryStaple: entry.isPantryStaple,
      isCustom: false,
      isCompatibleQuantity: agg.isCompatibleQuantity,
      quantity: agg.quantity,
      unit: agg.unit,
      quantityText: agg.quantityText,
      requirements: agg.requirements,
      status: isChecked ? "checked" : "unchecked",
      updatedAt: override ? override.updatedAt : 0,
      recipes: entry.recipes,
    });
  });

  // 3. Merge ad-hoc custom items (retaining immutable UUID identity)
  (safeSession.customItems || []).forEach((c) => {
    if (c.status === "dismissed") return; // Suppressed from UI via tombstone

    const aisle = c.category || categorizeAisle(c.name);
    const qtyStr = c.quantity !== null && c.quantity !== undefined ? formatQuantityFraction(c.quantity) : "";
    const quantityText = qtyStr ? (c.unit ? `${qtyStr} ${c.unit}` : qtyStr) : "";

    finalizedItems.push({
      key: `custom:${c.id}`,
      id: c.id,
      name: toTitleCase(c.name.trim()),
      aisle,
      isPantryStaple: false,
      isCustom: true,
      isCompatibleQuantity: true,
      quantity: c.quantity,
      unit: c.unit || "",
      quantityText,
      requirements: [],
      status: c.status === "checked" ? "checked" : "unchecked",
      updatedAt: c.updatedAt || 0,
      recipes: [],
      note: c.note || "",
    });
  });

  // 4. Split into active checklist vs collapsible pantry staples
  const activeItems = [];
  const staples = [];

  finalizedItems.forEach((item) => {
    const override = itemOverrides[item.key];
    const isPromoted = Boolean(override?.isPantryPromoted);

    // If pantry staple and NOT promoted, and not currently checked, keep in staples drawer
    if (item.isPantryStaple && !isPromoted && item.status !== "checked") {
      staples.push(item);
    } else {
      activeItems.push(item);
    }
  });

  // Group active items by supermarket aisle
  const effectiveAisleOrder = Array.isArray(customAisleOrder) && customAisleOrder.length > 0
    ? customAisleOrder
    : DEFAULT_AISLE_ORDER;

  const aisleGroupsMap = new Map();
  effectiveAisleOrder.forEach((a) => aisleGroupsMap.set(a, []));

  activeItems.forEach((item) => {
    const cat = aisleGroupsMap.has(item.aisle) ? item.aisle : "Household & Other";
    if (!aisleGroupsMap.has(cat)) {
      aisleGroupsMap.set(cat, []);
    }
    aisleGroupsMap.get(cat).push(item);
  });

  const aisles = [];
  effectiveAisleOrder.forEach((category) => {
    const items = aisleGroupsMap.get(category);
    if (items && items.length > 0) {
      aisles.push({ category, items });
    }
  });

  // Include any extra categories present in items but omitted from custom order
  aisleGroupsMap.forEach((items, category) => {
    if (!effectiveAisleOrder.includes(category) && items && items.length > 0) {
      aisles.push({ category, items });
    }
  });

  const totalCount = activeItems.length;
  const checkedCount = activeItems.filter((i) => i.status === "checked").length;
  const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  return {
    totalCount,
    checkedCount,
    progressPercent,
    activeRecipes,
    aisles,
    pantryStaples: staples,
  };
}

/**
 * Creates a fresh, clean grocery session with standard UUID.
 */
export function createGrocerySession(initialData = {}) {
  const now = Date.now();
  return {
    id: initialData.id || generateUUID(),
    status: initialData.status || "active",
    startedAt: initialData.startedAt || now,
    updatedAt: initialData.updatedAt || now,
    completedAt: initialData.completedAt || null,
    revision: typeof initialData.revision === "number" ? initialData.revision : 1,
    recipes: Array.isArray(initialData.recipes) ? initialData.recipes : [],
    customItems: Array.isArray(initialData.customItems) ? initialData.customItems : [],
    itemOverrides: initialData.itemOverrides && typeof initialData.itemOverrides === "object" ? initialData.itemOverrides : {},
  };
}

/**
 * Resets the active grocery trip to a brand new clean session with fresh UUID.
 */
export function resetGrocerySession(newId = null) {
  const now = Date.now();
  return {
    id: newId || generateUUID(),
    status: "active",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    revision: 1,
    recipes: [],
    customItems: [],
    itemOverrides: {},
  };
}

/**
 * Rollover transformation:
 * When completing a trip with unpurchased items, detaches unchecked items from recipes
 * and converts them into standalone custom items in a brand-new session.
 */
export function rolloverGrocerySession(currentSession, recipesLibrary, newId = null) {
  const now = Date.now();
  const safeSession = currentSession || EMPTY_GROCERY_SESSION;
  const derived = selectGroceryList(safeSession, recipesLibrary);

  const uncheckedCustom = [];

  derived.aisles.forEach((aisle) => {
    aisle.items.forEach((item) => {
      if (item.status === "unchecked") {
        if (item.isCustom) {
          uncheckedCustom.push({
            id: item.id || generateUUID(),
            name: item.name,
            quantity: item.quantity,
            unit: item.unit || "",
            category: item.aisle,
            note: item.note || "",
            status: "unchecked",
            updatedAt: now,
          });
        } else {
          const noteDesc = item.isCompatibleQuantity
            ? (item.recipes || []).map((r) => `${r.quantity ? `${formatQuantityFraction(r.quantity)} ` : ""}${r.unit ? `${r.unit} ` : ""}for ${r.recipeTitle}`).join("; ")
            : (item.requirements || []).map((req) => `${req.quantityText} for ${req.recipeTitle}`).join("; ");

          uncheckedCustom.push({
            id: generateUUID(),
            name: item.name,
            quantity: item.isCompatibleQuantity ? item.quantity : null,
            unit: item.isCompatibleQuantity ? item.unit : "",
            category: item.aisle,
            note: noteDesc ? `Rolled over: ${noteDesc}` : "Rolled over from previous trip",
            status: "unchecked",
            updatedAt: now,
          });
        }
      }
    });
  });

  return {
    id: newId || generateUUID(),
    status: "active",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    revision: 1,
    recipes: [], // Recipes detached
    customItems: uncheckedCustom,
    itemOverrides: {}, // Fresh session-scoped overrides
  };
}

/**
 * Reconciles local and remote grocery sessions using Per-Item Last-Write-Wins (LWW) with tombstones.
 */
export function reconcileGrocerySessions(local, remote) {
  if (!local) return remote || EMPTY_GROCERY_SESSION;
  if (!remote) return local;

  // If different session IDs, prefer whichever is more recently updated
  if (local.id && remote.id && local.id !== remote.id) {
    return (remote.updatedAt || 0) >= (local.updatedAt || 0) ? remote : local;
  }

  // 1. Reconcile itemOverrides (per-item LWW)
  const mergedOverrides = { ...(local.itemOverrides || {}) };

  Object.entries(remote.itemOverrides || {}).forEach(([key, remoteVal]) => {
    const localVal = mergedOverrides[key];
    if (!localVal || (remoteVal.updatedAt || 0) > (localVal.updatedAt || 0)) {
      mergedOverrides[key] = remoteVal;
    }
  });

  // 2. Reconcile custom items by UUID, preserving tombstones to prevent resurrection
  const customMap = new Map();
  [...(local.customItems || []), ...(remote.customItems || [])].forEach((item) => {
    if (!item || !item.id) return;
    const existing = customMap.get(item.id);
    if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
      customMap.set(item.id, item);
    }
  });

  // 3. Reconcile recipes array (LWW on overall recipe list modification)
  const recipes = (remote.updatedAt || 0) >= (local.updatedAt || 0)
    ? remote.recipes || []
    : local.recipes || [];

  return {
    id: local.id || remote.id || generateUUID(),
    status: (remote.updatedAt || 0) >= (local.updatedAt || 0) ? remote.status : local.status,
    startedAt: local.startedAt || remote.startedAt || Date.now(),
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
    completedAt: remote.completedAt || local.completedAt,
    revision: Math.max(local.revision || 1, remote.revision || 1),
    recipes,
    itemOverrides: mergedOverrides,
    customItems: [...customMap.values()],
  };
}

// -----------------------------------------------------------------------------
// Phase 2: Namespaced Local Storage & Mutation Queue
// -----------------------------------------------------------------------------

export function getStorageKeyGrocerySession(userId = null) {
  return userId ? `${STORAGE_PREFIX_GROCERY_SESSION}:${userId}` : `${STORAGE_PREFIX_GROCERY_SESSION}:guest`;
}

export function getStorageKeyGroceryQueue(userId = null) {
  return userId ? `${STORAGE_PREFIX_GROCERY_QUEUE}:${userId}` : `${STORAGE_PREFIX_GROCERY_QUEUE}:guest`;
}

export function getStorageKeyAisleOrder(userId = null) {
  return userId ? `${STORAGE_PREFIX_AISLE_ORDER}:${userId}` : `${STORAGE_PREFIX_AISLE_ORDER}:guest`;
}

/**
 * Reads grocery session from localStorage (namespaced by userId).
 */
export function readGrocerySession(userId = null) {
  if (typeof window === "undefined" || !window.localStorage) {
    return EMPTY_GROCERY_SESSION;
  }
  try {
    const key = getStorageKeyGrocerySession(userId);
    let raw = window.localStorage.getItem(key);
    // Backward compatibility fallback to legacy un-namespaced key for guest
    if (!raw && !userId) {
      raw = window.localStorage.getItem(STORAGE_KEY_GROCERIES);
    }
    if (!raw) return EMPTY_GROCERY_SESSION;
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY_GROCERY_SESSION,
      ...parsed,
      recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
      customItems: Array.isArray(parsed.customItems) ? parsed.customItems : [],
      itemOverrides: parsed.itemOverrides && typeof parsed.itemOverrides === "object" ? parsed.itemOverrides : {},
      revision: typeof parsed.revision === "number" ? parsed.revision : 1,
    };
  } catch {
    return EMPTY_GROCERY_SESSION;
  }
}

/**
 * Saves grocery session to localStorage (namespaced by userId).
 */
export function saveGrocerySession(session, userId = null) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const key = getStorageKeyGrocerySession(userId);
    const toSave = {
      ...session,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(key, JSON.stringify(toSave));
    // If guest, sync legacy key for backward compatibility
    if (!userId) {
      window.localStorage.setItem(STORAGE_KEY_GROCERIES, JSON.stringify(toSave));
    }
  } catch (err) {
    console.error("Failed to save groceries to localStorage", err);
  }
}

/**
 * Reads the pending offline mutation queue for a user.
 */
export function readGroceryQueue(userId = null) {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const key = getStorageKeyGroceryQueue(userId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGroceryQueue(queue, userId = null) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const key = getStorageKeyGroceryQueue(userId);
    window.localStorage.setItem(key, JSON.stringify(queue || []));
  } catch (err) {
    console.error("Failed to save grocery queue", err);
  }
}

export function enqueueGroceryMutation(mutation, userId = null) {
  const q = readGroceryQueue(userId);
  q.push(mutation);
  saveGroceryQueue(q, userId);
  return q;
}

export function ackGroceryMutations(ackIds, userId = null) {
  if (!ackIds || !ackIds.length) return readGroceryQueue(userId);
  const ackSet = new Set(ackIds);
  const q = readGroceryQueue(userId);
  const nextQ = q.filter((m) => !ackSet.has(m.mutationId));
  saveGroceryQueue(nextQ, userId);
  return nextQ;
}

export function clearGroceryQueue(userId = null) {
  saveGroceryQueue([], userId);
}

// -----------------------------------------------------------------------------
// Phase 2: Mutation Application & Rebase Reducers
// -----------------------------------------------------------------------------

export function applyMutationToSession(session, mutation) {
  if (!session || !mutation) return session;
  const now = mutation.clientTimestamp || Date.now();
  const next = {
    ...session,
    recipes: [...(session.recipes || [])],
    customItems: [...(session.customItems || [])],
    itemOverrides: { ...(session.itemOverrides || {}) },
    updatedAt: now,
  };

  const { type, targetId, payload } = mutation;

  if (type === "ITEM_STATUS_CHANGED" && targetId) {
    const existing = next.itemOverrides[targetId];
    if (existing?.status !== "dismissed") {
      next.itemOverrides[targetId] = {
        ...(existing || {}),
        status: payload.status,
        updatedAt: now,
      };
    }
  } else if (type === "ITEM_DISMISSED" && targetId) {
    next.itemOverrides[targetId] = {
      ...(next.itemOverrides[targetId] || {}),
      status: "dismissed",
      updatedAt: now,
    };
  } else if (type === "ITEM_RESTORED" && targetId) {
    next.itemOverrides[targetId] = {
      ...(next.itemOverrides[targetId] || {}),
      status: "unchecked",
      updatedAt: now,
    };
  } else if (type === "PANTRY_ITEM_PROMOTED" && targetId) {
    next.itemOverrides[targetId] = {
      ...(next.itemOverrides[targetId] || {}),
      status: "unchecked",
      isPantryPromoted: true,
      updatedAt: now,
    };
  } else if (type === "CUSTOM_ITEM_ADDED" && targetId) {
    if (!next.customItems.some((c) => c.id === targetId)) {
      next.customItems.push({
        id: targetId,
        name: payload.name || "Custom Item",
        quantity: payload.quantity ?? null,
        unit: payload.unit || "",
        category: payload.category || "Household & Other",
        note: payload.note || "",
        status: "unchecked",
        updatedAt: now,
      });
    }
  } else if (type === "CUSTOM_ITEM_EDITED" && targetId) {
    next.customItems = next.customItems.map((c) =>
      c.id === targetId ? { ...c, ...payload, updatedAt: now } : c
    );
  } else if (type === "CUSTOM_ITEM_DELETED" && targetId) {
    next.customItems = next.customItems.map((c) =>
      c.id === targetId ? { ...c, status: "dismissed", updatedAt: now } : c
    );
  } else if (type === "RECIPE_ADDED" && targetId) {
    const idx = next.recipes.findIndex((r) => r.recipeId === targetId);
    if (idx >= 0) {
      next.recipes[idx] = { ...next.recipes[idx], servings: payload.servings || 2 };
    } else {
      next.recipes.push({
        recipeId: targetId,
        servings: payload.servings || 2,
        addedAt: now,
      });
    }
  } else if (type === "RECIPE_REMOVED" && targetId) {
    next.recipes = next.recipes.filter((r) => r.recipeId !== targetId);
  } else if (type === "RECIPE_SERVINGS_CHANGED" && targetId) {
    next.recipes = next.recipes.map((r) =>
      r.recipeId === targetId ? { ...r, servings: payload.nextServings } : r
    );
  }

  return next;
}

export function rebaseMutationsOverSession(baseSession, pendingMutations) {
  if (!Array.isArray(pendingMutations) || !pendingMutations.length) {
    return baseSession;
  }
  let current = baseSession;
  pendingMutations.forEach((mut) => {
    current = applyMutationToSession(current, mut);
  });
  return current;
}

// -----------------------------------------------------------------------------
// Phase 2: Canonical Guest Merge
// -----------------------------------------------------------------------------

export function mergeGuestIntoAccountSession(guestSession, accountSession) {
  if (!guestSession) return accountSession || EMPTY_GROCERY_SESSION;
  if (!accountSession) return guestSession;

  const now = Date.now();
  // 1. Merge recipes: unique + max servings on collision
  const recipeMap = new Map();
  (accountSession.recipes || []).forEach((r) => {
    recipeMap.set(r.recipeId, { ...r });
  });
  (guestSession.recipes || []).forEach((r) => {
    if (recipeMap.has(r.recipeId)) {
      const existing = recipeMap.get(r.recipeId);
      existing.servings = Math.max(existing.servings || 2, r.servings || 2);
    } else {
      recipeMap.set(r.recipeId, { ...r, addedAt: r.addedAt || now });
    }
  });

  // 2. Merge custom items by UUID
  const customMap = new Map();
  (accountSession.customItems || []).forEach((c) => {
    customMap.set(c.id, { ...c });
  });
  (guestSession.customItems || []).forEach((c) => {
    const existing = customMap.get(c.id);
    if (!existing || (c.updatedAt || 0) > (existing.updatedAt || 0)) {
      customMap.set(c.id, { ...c });
    }
  });

  // 3. Merge item overrides by canonical key
  const mergedOverrides = { ...(accountSession.itemOverrides || {}) };
  Object.entries(guestSession.itemOverrides || {}).forEach(([key, override]) => {
    const existing = mergedOverrides[key];
    if (!existing || (override.updatedAt || 0) > (existing.updatedAt || 0)) {
      mergedOverrides[key] = override;
    }
  });

  return {
    ...accountSession,
    recipes: [...recipeMap.values()],
    customItems: [...customMap.values()],
    itemOverrides: mergedOverrides,
    updatedAt: now,
  };
}

// -----------------------------------------------------------------------------
// Phase 2: Formatted Plain-Text Export
// -----------------------------------------------------------------------------

export function formatGroceryListText(derivedList) {
  if (!derivedList) return "";
  const lines = [];

  const recipeCount = (derivedList.activeRecipes || []).length;
  lines.push(`🛒 MISE Grocery List (${recipeCount} recipe${recipeCount === 1 ? "" : "s"})`);
  lines.push("");

  (derivedList.aisles || []).forEach((aisle) => {
    if (!aisle.items || !aisle.items.length) return;
    lines.push(aisle.category.toUpperCase());
    aisle.items.forEach((item) => {
      const box = item.status === "checked" ? "[x]" : "[ ]";
      if (item.isCompatibleQuantity) {
        const qtyPrefix = item.quantityText ? `${item.quantityText} ` : "";
        lines.push(`${box} ${qtyPrefix}${item.name}`);
      } else {
        const reqStr = (item.requirements || [])
          .map((r) => `${r.quantityText} for ${r.recipeTitle}`)
          .join("; ");
        lines.push(`${box} ${item.name} (${reqStr})`);
      }
    });
    lines.push("");
  });

  if (derivedList.pantryStaples && derivedList.pantryStaples.length > 0) {
    lines.push("---");
    lines.push("PANTRY STAPLES (Check at home)");
    const stapleNames = derivedList.pantryStaples.map((s) => s.name).join(", ");
    lines.push(`• ${stapleNames}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

// -----------------------------------------------------------------------------
// Phase 2: Custom Aisle Ordering
// -----------------------------------------------------------------------------

export const DEFAULT_AISLE_ORDER = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Refrigerated",
  "Bakery & Bread",
  "Pantry & Dry Goods",
  "Oils & Condiments",
  "Spices & Seasonings",
  "Frozen",
  "Household & Other",
];

export const PRESET_AISLE_PROFILES = {
  default: {
    name: "Default Supermarket",
    order: DEFAULT_AISLE_ORDER,
  },
  produceFirst: {
    name: "Produce-First (Trader Joe's)",
    order: [
      "Produce",
      "Bakery & Bread",
      "Dairy & Refrigerated",
      "Spices & Seasonings",
      "Oils & Condiments",
      "Pantry & Dry Goods",
      "Frozen",
      "Meat & Seafood",
      "Household & Other",
    ],
  },
  perimeterFirst: {
    name: "Perimeter-First (Costco / Wholesale)",
    order: [
      "Produce",
      "Meat & Seafood",
      "Bakery & Bread",
      "Dairy & Refrigerated",
      "Household & Other",
      "Pantry & Dry Goods",
      "Frozen",
      "Spices & Seasonings",
      "Oils & Condiments",
    ],
  },
};

export function readAisleOrder(userId = null) {
  if (typeof window === "undefined" || !window.localStorage) return DEFAULT_AISLE_ORDER;
  try {
    const raw = window.localStorage.getItem(getStorageKeyAisleOrder(userId));
    if (!raw) return DEFAULT_AISLE_ORDER;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_AISLE_ORDER;
  } catch {
    return DEFAULT_AISLE_ORDER;
  }
}

export function saveAisleOrder(order, userId = null) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(getStorageKeyAisleOrder(userId), JSON.stringify(order || DEFAULT_AISLE_ORDER));
  } catch (err) {
    console.error("Failed to save aisle order", err);
  }
}

export function reorderAisles(aisles, customOrder) {
  if (!Array.isArray(aisles) || !Array.isArray(customOrder)) return aisles;
  const aisleMap = new Map(aisles.map((a) => [a.category, a]));
  const result = [];
  customOrder.forEach((cat) => {
    if (aisleMap.has(cat)) {
      result.push(aisleMap.get(cat));
      aisleMap.delete(cat);
    }
  });
  aisleMap.forEach((a) => result.push(a));
  return result;
}

export function dbRecordToGrocerySession(record) {
  if (!record) return null;
  return {
    id: record.id,
    status: record.status || "active",
    startedAt: record.started_at ? new Date(record.started_at).getTime() : Date.now(),
    updatedAt: record.updated_at ? new Date(record.updated_at).getTime() : Date.now(),
    completedAt: record.completed_at ? new Date(record.completed_at).getTime() : null,
    revision: Number(record.revision) || 1,
    recipes: Array.isArray(record.recipes) ? record.recipes : [],
    customItems: Array.isArray(record.custom_items) ? record.custom_items : [],
    itemOverrides: record.item_overrides && typeof record.item_overrides === "object" ? record.item_overrides : {},
  };
}

export function getDeviceId() {
  if (typeof window === "undefined" || !window.localStorage) {
    return "browser-client";
  }
  let deviceId = window.localStorage.getItem("mise-device-id");
  if (!deviceId) {
    deviceId = generateUUID();
    window.localStorage.setItem("mise-device-id", deviceId);
  }
  return deviceId;
}
