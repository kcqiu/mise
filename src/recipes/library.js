import Fuse from "fuse.js";

export const STORAGE_KEY = "mise-library-v1";
export const EMPTY_LIBRARY = {
  version: 1,
  recipes: [],
  favorites: [],
  progress: {},
};
export const ARTWORKS = [
  "steak",
  "noodles",
  "chicken",
  "toast",
  "beans",
  "pancakes",
  "steak-sandwich",
  "lobster-butter",
  "mango-matcha",
  "jasmine-matcha",
];
export const RECIPE_IMAGES = {
  "steak-sandwich": "/recipe/art/steak-sandwich.webp",
  "lobster-butter": "/recipe/art/lobster-butter.webp",
  "mango-matcha": "/recipe/art/mango-matcha.webp",
  "jasmine-matcha": "/recipe/art/jasmine-matcha.webp",
  beans: "/recipe/art/brothy-beans.webp",
  steak: "/recipe/art/ribeye-steak.webp",
  chicken: "/recipe/art/lemon-chicken.webp",
  noodles: "/recipe/art/miso-noodles.webp",
  toast: "/recipe/art/tomato-toast.webp",
  pancakes: "/recipe/art/lemon-pancakes.webp",
};

const VIDEO_HOSTS = new Set([
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
]);

const videoId = (value) =>
  /^[a-zA-Z0-9_-]{5,100}$/.test(value || "") ? value : "";

/**
 * Keeps embeds limited to the three platforms we intentionally support.
 * The original URL remains the canonical fallback when a platform blocks playback.
 */
export function getRecipeVideo(sourceVideo) {
  if (typeof sourceVideo !== "string" || !sourceVideo.trim()) return null;

  try {
    const url = new URL(sourceVideo.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!VIDEO_HOSTS.has(host)) return null;
    const segments = url.pathname.split("/").filter(Boolean);

    if (host === "instagram.com") {
      const [kind, id] = segments;
      if (!["reel", "p", "tv"].includes(kind) || !videoId(id)) return null;
      const label = kind === "reel" ? "Instagram Reel" : "Instagram post";
      return {
        provider: "Instagram",
        label,
        url: `https://www.instagram.com/${kind}/${id}/`,
        embedUrl: `https://www.instagram.com/${kind}/${id}/embed/captioned/`,
      };
    }

    if (host === "tiktok.com") {
      const id = segments.at(-1) === "video" ? "" : segments.at(-1);
      const match = url.pathname.match(/^\/@([^/]+)\/video\/(\d+)\/?$/);
      if (!match) {
        return {
          provider: "TikTok",
          label: "TikTok video",
          url: url.toString(),
          embedUrl: "",
        };
      }
      return {
        provider: "TikTok",
        label: "TikTok video",
        url: `https://www.tiktok.com/@${match[1]}/video/${id}`,
        embedUrl: `https://www.tiktok.com/player/v1/${match[2]}?controls=1&description=0&music_info=0&loop=0`,
      };
    }

    const id =
      host === "youtu.be"
        ? segments[0]
        : url.searchParams.get("v") ||
          (segments[0] === "shorts" || segments[0] === "embed"
            ? segments[1]
            : "");
    if (!videoId(id)) return null;
    return {
      provider: "YouTube",
      label: "YouTube video",
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    };
  } catch {
    return null;
  }
}

export function totalMinutes(recipe) {
  return recipe.prepMinutes + recipe.cookMinutes + (recipe.restMinutes ?? 0);
}

export function groupIngredients(ingredients) {
  const groups = new Map();
  ingredients.forEach((ingredient) => {
    const name = ingredient.group?.trim() || "";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(ingredient);
  });
  return [...groups.entries()];
}

export function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ");
}

export function createSearch(recipes) {
  const indexed = recipes.map((recipe) => ({
    recipe,
    title: normalize(recipe.title),
    context: normalize(
      [
        recipe.description,
        recipe.category,
        recipe.cuisine,
        recipe.method,
        ...recipe.tags,
        ...recipe.keywords,
      ].join(" "),
    ),
    ingredients: normalize(
      recipe.ingredients.map((item) => item.name).join(" "),
    ),
  }));
  const fuse = new Fuse(indexed, {
    keys: [
      { name: "title", weight: 3 },
      { name: "ingredients", weight: 2 },
      { name: "context", weight: 1 },
    ],
    threshold: 0.32,
    ignoreLocation: true,
    includeScore: true,
  });
  return (query) => {
    const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
    if (!tokens.length) return recipes;
    const matches = tokens.map((token) => fuse.search(token));
    const scores = new Map(
      matches[0].map(({ item, score }) => [item.recipe.id, score]),
    );
    for (const result of matches.slice(1)) {
      const next = new Map(
        result.map(({ item, score }) => [item.recipe.id, score]),
      );
      for (const [id, score] of scores) {
        if (!next.has(id)) scores.delete(id);
        else scores.set(id, score + next.get(id));
      }
    }
    return indexed
      .filter(({ recipe }) => scores.has(recipe.id))
      .sort((a, b) => scores.get(a.recipe.id) - scores.get(b.recipe.id))
      .map(({ recipe }) => recipe);
  };
}

export function getCategories(recipes) {
  const categories = new Map();
  recipes.forEach(({ category }) =>
    categories.set(category, (categories.get(category) || 0) + 1),
  );
  return [...categories.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function quantityLabel(quantity, multiplier = 1) {
  if (quantity === null || quantity === undefined) return "";
  const value = quantity * multiplier;
  const whole = Math.floor(value);
  const fraction = value - whole;
  const fractions = [
    [0.125, "1/8"],
    [0.25, "1/4"],
    [1 / 3, "1/3"],
    [0.5, "1/2"],
    [2 / 3, "2/3"],
    [0.75, "3/4"],
  ];
  const match = fractions.find(
    ([number]) => Math.abs(fraction - number) < 0.006,
  );
  return match
    ? `${whole ? `${whole} ` : ""}${match[1]}`
    : Number(value.toFixed(2)).toString();
}

export function isValidArtwork(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const trimmed = value.trim();
  if (ARTWORKS.includes(trimmed)) return true;
  if (trimmed in RECIPE_IMAGES) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateRecipe(recipe) {
  const string = (value, max = 1000) =>
    typeof value === "string" && value.length <= max;
  const list = (value) =>
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((item) => string(item));
  if (
    !recipe ||
    typeof recipe !== "object" ||
    !string(recipe.id, 100) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(recipe.id)
  )
    throw new Error("Each recipe needs a valid, unique id.");
  if (
    !["title", "category"].every(
      (key) => string(recipe[key], 150) && recipe[key].trim(),
    )
  )
    throw new Error("Each recipe needs a title and category.");
  if (
    !["description", "cuisine", "method"].every((key) =>
      string(recipe[key] ?? ""),
    )
  )
    throw new Error("Recipe descriptions must be text.");
  if (
    !string(recipe.sourceVideo ?? "", 2000) ||
    (recipe.sourceVideo && !getRecipeVideo(recipe.sourceVideo))
  )
    throw new Error(
      "Recipe videos must be valid public Instagram, TikTok, or YouTube links.",
    );
  if (
    !Number.isFinite(recipe.servings) ||
    recipe.servings < 1 ||
    recipe.servings > 100
  )
    throw new Error("Servings must be between 1 and 100.");
  if (
    ![recipe.prepMinutes, recipe.cookMinutes, recipe.restMinutes ?? 0].every(
      (number) => Number.isFinite(number) && number >= 0 && number <= 10080,
    )
  )
    throw new Error("Recipe times must be valid minutes.");
  if (
    !["tags", "keywords", "notes", "substitutions", "equipment"].every((key) =>
      list(recipe[key] ?? []),
    )
  )
    throw new Error("Recipe tags and notes must be lists of text.");
  if (
    !Array.isArray(recipe.ingredients) ||
    !recipe.ingredients.length ||
    recipe.ingredients.length > 150 ||
    !recipe.ingredients.every(
      (item) =>
        item &&
        string(item.name, 300) &&
        item.name.trim() &&
        string(item.unit ?? "", 50) &&
        string(item.note ?? "", 300) &&
        string(item.group ?? "", 100) &&
        (item.quantity == null ||
          (Number.isFinite(item.quantity) &&
            item.quantity >= 0 &&
            item.quantity <= 100000)),
    )
  )
    throw new Error("Add valid ingredient names and quantities.");
  if (
    !Array.isArray(recipe.steps) ||
    !recipe.steps.length ||
    recipe.steps.length > 100 ||
    !recipe.steps.every(
      (step) =>
        step &&
        string(step.title ?? "", 150) &&
        string(step.instruction, 5000) &&
        step.instruction.trim(),
    )
  )
    throw new Error("Add at least one cooking instruction.");
  // Reconstruct imported records so only supported content enters the library.
  return {
    id: recipe.id,
    title: recipe.title.trim(),
    category: recipe.category.trim(),
    description: recipe.description ?? "",
    cuisine: recipe.cuisine ?? "",
    method: recipe.method ?? "",
    sourceVideo: getRecipeVideo(recipe.sourceVideo)?.url ?? "",
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    restMinutes: recipe.restMinutes ?? 0,
    tags: recipe.tags ?? [],
    keywords: recipe.keywords ?? [],
    notes: recipe.notes ?? [],
    substitutions: recipe.substitutions ?? [],
    equipment: recipe.equipment ?? [],
    artwork: isValidArtwork(recipe.artwork) ? recipe.artwork.trim() : "",
    example: recipe.example === true,
    createdAt:
      typeof recipe.createdAt === "string" && recipe.createdAt
        ? recipe.createdAt
        : "",
    updatedAt:
      typeof recipe.updatedAt === "string" && recipe.updatedAt
        ? recipe.updatedAt
        : "",
    ingredients: recipe.ingredients.map((item, index) => ({
      id: `ingredient-${index}`,
      name: item.name,
      quantity: item.quantity ?? null,
      unit: item.unit ?? "",
      note: item.note ?? "",
      group: (item.group ?? "").trim(),
    })),
    steps: recipe.steps.map((step, index) => ({
      id: `step-${index}`,
      title: step.title ?? "",
      instruction: step.instruction,
    })),
  };
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  const recipes = Array.isArray(data)
    ? data
    : Array.isArray(data?.recipes)
      ? data.recipes
      : data && typeof data === "object" && (data.title || data.name)
        ? [data]
        : null;
  if (!Array.isArray(recipes) || recipes.length > 1000)
    throw new Error(
      "Choose a recipe JSON file or a mise. backup (up to 1,000 recipes).",
    );
  if (!Array.isArray(data) && data.version !== undefined && data.version !== 1)
    throw new Error("This backup version is not supported yet.");
  const validated = recipes.map(validateRecipe);
  if (new Set(validated.map(({ id }) => id)).size !== validated.length)
    throw new Error("The file has duplicate recipe ids.");
  return {
    recipes: validated,
    favorites: Array.isArray(data.favorites)
      ? data.favorites.filter((id) => typeof id === "string")
      : [],
  };
}

export function readLibrary() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { library: EMPTY_LIBRARY, error: "" };
    const data = JSON.parse(raw);
    const parsed = parseBackup(raw);
    return {
      library: {
        ...EMPTY_LIBRARY,
        ...parsed,
        progress:
          data.progress &&
          typeof data.progress === "object" &&
          !Array.isArray(data.progress)
            ? Object.fromEntries(
                Object.entries(data.progress).map(([id, value]) => [
                  id,
                  {
                    ingredients: Array.isArray(value?.ingredients)
                      ? value.ingredients.filter(
                          (item) => typeof item === "string",
                        )
                      : [],
                    steps: Array.isArray(value?.steps)
                      ? value.steps.filter((item) => typeof item === "string")
                      : [],
                  },
                ]),
              )
            : {},
      },
      error: "",
    };
  } catch {
    return {
      library: EMPTY_LIBRARY,
      error:
        "Your saved library couldn't be read. You can still browse the starter collection or import a backup.",
    };
  }
}

export function getAccountLibraryStorageKey(userId) {
  return userId ? `${STORAGE_KEY}:user:${userId}` : STORAGE_KEY;
}

export function readAccountLibrary(userId) {
  if (!userId || typeof window === "undefined" || !window.localStorage) {
    return EMPTY_LIBRARY;
  }
  try {
    const raw = window.localStorage.getItem(getAccountLibraryStorageKey(userId));
    if (!raw) return EMPTY_LIBRARY;
    const parsed = JSON.parse(raw);
    return {
      recipes: Array.isArray(parsed?.recipes)
        ? parsed.recipes
            .map((r) => {
              try {
                return validateRecipe(r);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : [],
      favorites: Array.isArray(parsed?.favorites) ? parsed.favorites : [],
      progress:
        parsed?.progress && typeof parsed.progress === "object"
          ? parsed.progress
          : {},
      sharedRecipes: Array.isArray(parsed?.sharedRecipes)
        ? parsed.sharedRecipes
        : [],
    };
  } catch {
    return EMPTY_LIBRARY;
  }
}

export function saveAccountLibrary(userId, library) {
  if (!userId || typeof window === "undefined" || !window.localStorage) return;
  try {
    const key = getAccountLibraryStorageKey(userId);
    const toSave = {
      recipes: Array.isArray(library?.recipes) ? library.recipes : [],
      favorites: Array.isArray(library?.favorites) ? library.favorites : [],
      progress:
        library?.progress && typeof library.progress === "object"
          ? library.progress
          : {},
      sharedRecipes: Array.isArray(library?.sharedRecipes)
        ? library.sharedRecipes
        : [],
    };
    window.localStorage.setItem(key, JSON.stringify(toSave));
  } catch {
    // Non-blocking storage quota error
  }
}
