import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGeminiCoverPrompt,
  enhanceRecipeWithGemini,
  generateRecipeCoverWithGemini,
  parseRecipeFromPhoto,
  parseRecipeFromSocial,
  parseRecipeFromText,
  parseRecipeFromUrl,
} from "./ai";
import * as cloudModule from "./cloud";

describe("src/recipes/ai.js AI client bridge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds an appetizing food photography prompt from recipe details", () => {
    const prompt = buildGeminiCoverPrompt({
      title: "Crispy Duck Confit",
      cuisine: "French",
      description: "Tender cured duck legs cooked slowly in duck fat.",
      ingredients: [
        { name: "duck legs" },
        { name: "duck fat" },
        { name: "thyme" },
        { name: "kosher salt" },
      ],
    });

    expect(prompt).toContain("Crispy Duck Confit");
    expect(prompt).toContain("French style");
    expect(prompt).toContain("duck legs, duck fat, thyme, kosher salt");
    expect(prompt).toContain("photorealistic");
    expect(prompt).toContain("8k resolution");
  });

  it("parses text by sending payload to /api/ai/parse-recipe", async () => {
    const mockRecipe = {
      title: "Steak and Eggs",
      category: "Breakfast",
      ingredients: [{ name: "ribeye steak", quantity: 1, unit: "steak" }],
      steps: [{ title: "Sear", instruction: "Pan sear steak." }],
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, recipe: mockRecipe }),
    });

    const result = await parseRecipeFromText("Steak and eggs recipe text");
    expect(global.fetch).toHaveBeenCalledWith("/api/ai/parse-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "text", text: "Steak and eggs recipe text" }),
    });
    expect(result).toEqual(mockRecipe);
  });

  it("parses website URL by sending payload to /api/ai/parse-recipe", async () => {
    const mockRecipe = { title: "Roast Potatoes", category: "Sides" };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, recipe: mockRecipe }),
    });

    const result = await parseRecipeFromUrl("https://seriouseats.com/roast-potatoes");
    expect(global.fetch).toHaveBeenCalledWith("/api/ai/parse-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "url", url: "https://seriouseats.com/roast-potatoes" }),
    });
    expect(result).toEqual(mockRecipe);
  });

  it("parses social media URL by sending payload to /api/ai/parse-recipe", async () => {
    const mockRecipe = { title: "Viral Pasta", category: "Dinner" };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, recipe: mockRecipe }),
    });

    const result = await parseRecipeFromSocial("https://tiktok.com/@chef/video/12345");
    expect(global.fetch).toHaveBeenCalledWith("/api/ai/parse-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "social", url: "https://tiktok.com/@chef/video/12345" }),
    });
    expect(result).toEqual(mockRecipe);
  });

  it("parses photo by sending base64 data to /api/ai/parse-recipe", async () => {
    const mockRecipe = { title: "Grandma's Cookies", category: "Baking" };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, recipe: mockRecipe }),
    });

    const fakeBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    const result = await parseRecipeFromPhoto(fakeBlob);
    expect(global.fetch).toHaveBeenCalledWith("/api/ai/parse-recipe", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }));
    expect(result).toEqual(mockRecipe);
  });

  it("polishes recipe draft by sending payload to /api/ai/polish-recipe", async () => {
    const unpolished = { title: "Pasta", ingredients: [] };
    const polished = { title: "Silky Cacio e Pepe", ingredients: [{ name: "pecorino" }] };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, recipe: polished }),
    });

    const result = await enhanceRecipeWithGemini(unpolished);
    expect(global.fetch).toHaveBeenCalledWith("/api/ai/polish-recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe: unpolished }),
    });
    expect(result).toEqual(polished);
  });

  it("handles missing API key error with a clear guidance message", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ missingKey: true, error: "Missing key" }),
    });

    await expect(parseRecipeFromText("Some text")).rejects.toThrow(
      /Gemini API key is not configured/i
    );
  });

  it("generates cover image and uploads to Supabase CDN when userId is provided", async () => {
    const fakeBase64 = btoa("mock-image-binary-data");
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, base64: fakeBase64, mimeType: "image/jpeg" }),
    });

    vi.spyOn(cloudModule, "uploadRecipeCover").mockResolvedValueOnce(
      "https://supabase.co/storage/v1/object/public/recipe-covers/user-123/recipe-1-12345.jpg"
    );

    const cdnUrl = await generateRecipeCoverWithGemini(
      { title: "Pan-seared Salmon" },
      { userId: "user-123", recipeId: "recipe-1" }
    );

    expect(cdnUrl).toBe("https://supabase.co/storage/v1/object/public/recipe-covers/user-123/recipe-1-12345.jpg");
    expect(cloudModule.uploadRecipeCover).toHaveBeenCalled();
  });
});
