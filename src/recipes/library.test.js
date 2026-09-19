import { describe, expect, it } from "vitest";
import recipes from "./data/recipes.json";
import {
  createSearch,
  getAccountLibraryStorageKey,
  getCategories,
  getRecipeVideo,
  parseBackup,
  quantityLabel,
  readAccountLibrary,
  saveAccountLibrary,
  validateRecipe,
} from "./library";

describe("recipe search and content", () => {
  const search = createSearch(recipes);
  it("validates every starter recipe", () =>
    recipes.forEach((recipe) =>
      expect(() => validateRecipe(recipe)).not.toThrow(),
    ));
  it("finds beef even when it is not in the title", () =>
    expect(search("beef").map(({ id }) => id)).toContain(
      "garlic-butter-ribeye",
    ));
  it("searches cooking methods and combines multiword queries", () =>
    expect(search("air fryer chicken").map(({ id }) => id)).toEqual([
      "crispy-lemon-chicken",
    ]));
  it("forgives small spelling errors", () =>
    expect(search("mushrom").map(({ id }) => id)).toContain(
      "miso-mushroom-noodles",
    ));
  it("normalizes case and hyphens", () =>
    expect(search("AIR-FRYER").map(({ id }) => id)).toContain(
      "crispy-lemon-chicken",
    ));
  it("returns an empty list for unrelated queries", () =>
    expect(search("spaceship")).toEqual([]));
  it("discovers new categories from content", () =>
    expect(getCategories([...recipes, { category: "Sauces" }])).toContainEqual([
      "Sauces",
      1,
    ]));
  it("scales quantities without long decimals", () => {
    expect(quantityLabel(1, 0.5)).toBe("1/2");
    expect(quantityLabel(1.5)).toBe("1 1/2");
    expect(quantityLabel(450, 1.5)).toBe("675");
    expect(quantityLabel(null, 2)).toBe("");
  });
  it("imports arrays and versioned backups", () => {
    expect(parseBackup(JSON.stringify(recipes)).recipes).toHaveLength(
      recipes.length,
    );
    expect(
      parseBackup(
        JSON.stringify({ version: 1, recipes, favorites: [recipes[0].id] }),
      ).favorites,
    ).toEqual([recipes[0].id]);
  });
  it("parses single recipe JSON objects as well as backup arrays", () => {
    const single = parseBackup(JSON.stringify(recipes[0]));
    expect(single.recipes).toHaveLength(1);
    expect(single.recipes[0].title).toBe(recipes[0].title);
  });
  it("rejects incomplete, duplicate, or unsupported records", () => {
    expect(() => parseBackup("null")).toThrow(/recipe JSON/);
    expect(() =>
      parseBackup(JSON.stringify([{ title: "Missing fields" }])),
    ).toThrow();
    expect(() => parseBackup(JSON.stringify([recipes[0], recipes[0]]))).toThrow(
      /duplicate/,
    );
    expect(() => parseBackup(JSON.stringify({ version: 2, recipes }))).toThrow(
      /version/,
    );
    expect(() => validateRecipe({ ...recipes[0], servings: 0 })).toThrow(
      /Servings/,
    );
    expect(() =>
      validateRecipe({
        ...recipes[0],
        ingredients: [{ name: "flour", quantity: -2 }],
      }),
    ).toThrow(/ingredient/);
  });
  it("preserves valid image URLs and ignores unsupported/dangerous imported properties", () => {
    const recipe = validateRecipe({
      ...recipes[0],
      artwork: "https://images.unsplash.com/photo-example.jpg",
      dangerous: "ignore me",
    });
    expect(recipe.artwork).toBe("https://images.unsplash.com/photo-example.jpg");
    expect(recipe.dangerous).toBeUndefined();

    const unsafeRecipe = validateRecipe({
      ...recipes[0],
      artwork: "javascript:alert(1)",
    });
    expect(unsafeRecipe.artwork).toBe("");
  });
  it("keeps grouped ingredients and resting time in a saved recipe", () => {
    const recipe = validateRecipe(
      recipes.find((item) => item.id === "steak-sandwich-chimichurri-aioli"),
    );
    expect(recipe.restMinutes).toBe(10);
    expect(recipe.ingredients[0].group).toBe("Steak");
  });
  it("creates safe embeds for supported recipe video links", () => {
    expect(
      getRecipeVideo(
        "https://www.instagram.com/reel/DXGElPMgHia/?stkn=ZnJmcTh4YWlkYTVy",
      ),
    ).toMatchObject({
      provider: "Instagram",
      embedUrl: "https://www.instagram.com/reel/DXGElPMgHia/embed/captioned/",
    });
    expect(
      getRecipeVideo(
        "https://www.tiktok.com/@younghummy/video/7276566593939787014",
      ),
    ).toMatchObject({
      provider: "TikTok",
      embedUrl:
        "https://www.tiktok.com/player/v1/7276566593939787014?controls=1&description=0&music_info=0&loop=0",
    });
    expect(
      getRecipeVideo("https://vt.tiktok.com/ZS12345/"),
    ).toMatchObject({
      provider: "TikTok",
      url: "https://vt.tiktok.com/ZS12345/",
      embedUrl: "",
    });
    expect(
      getRecipeVideo("https://vm.tiktok.com/ZM12345/"),
    ).toMatchObject({
      provider: "TikTok",
      url: "https://vm.tiktok.com/ZM12345/",
      embedUrl: "",
    });
    expect(getRecipeVideo("https://example.com/video")).toBeNull();
  });

  it("persists and reads user-scoped account libraries in local storage", () => {
    const userId = "user-test-offline-123";
    expect(getAccountLibraryStorageKey(userId)).toBe("mise-library-v1:user:user-test-offline-123");
    expect(getAccountLibraryStorageKey(null)).toBe("mise-library-v1");

    // Initially empty
    expect(readAccountLibrary(userId).recipes).toEqual([]);

    // Save and re-read
    const sampleLib = {
      recipes: [{ ...recipes[0], id: "custom-pie", title: "Custom Apple Pie" }],
      favorites: ["custom-pie"],
      progress: { "custom-pie": { steps: [0] } },
      sharedRecipes: [],
    };
    saveAccountLibrary(userId, sampleLib);

    const reloaded = readAccountLibrary(userId);
    expect(reloaded.recipes).toHaveLength(1);
    expect(reloaded.recipes[0].title).toBe("Custom Apple Pie");
    expect(reloaded.favorites).toEqual(["custom-pie"]);
    expect(reloaded.progress["custom-pie"].steps).toEqual([0]);
  });
});
