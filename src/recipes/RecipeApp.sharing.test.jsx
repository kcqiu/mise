import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloudMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  watchSession: vi.fn(() => () => {}),
  loadAccountLibrary: vi.fn(),
  loadAccountGrocerySession: vi.fn(),
  loadRecipeById: vi.fn(),
  getOrCreateRecipeShare: vi.fn(),
  loadRecipeByShareToken: vi.fn(),
  revokeRecipeShare: vi.fn(),
  saveAccountRecipe: vi.fn(),
  setAccountFavorite: vi.fn(),
  deleteAccountRecipe: vi.fn(),
  deleteRecipeCover: vi.fn(),
}));

vi.mock("./cloud", async () => {
  const actual = await vi.importActual("./cloud");
  return {
    ...actual,
    cloudEnabled: true,
    getSession: cloudMocks.getSession,
    watchSession: cloudMocks.watchSession,
    loadAccountLibrary: cloudMocks.loadAccountLibrary,
    loadAccountGrocerySession: cloudMocks.loadAccountGrocerySession,
    loadRecipeById: cloudMocks.loadRecipeById,
    getOrCreateRecipeShare: cloudMocks.getOrCreateRecipeShare,
    loadRecipeByShareToken: cloudMocks.loadRecipeByShareToken,
    revokeRecipeShare: cloudMocks.revokeRecipeShare,
    saveAccountRecipe: cloudMocks.saveAccountRecipe,
    setAccountFavorite: cloudMocks.setAccountFavorite,
    deleteAccountRecipe: cloudMocks.deleteAccountRecipe,
    deleteRecipeCover: cloudMocks.deleteRecipeCover,
  };
});

import RecipeApp from "./RecipeApp";

const mockSharedRecipe = {
  id: "shared-recipe-uuid-1234",
  title: "Grandma's Secret Focaccia",
  category: "Baking",
  cuisine: "Italian",
  description: "Fluffy, olive-oil drenched focaccia with rosemary and flaky sea salt.",
  servings: 6,
  prepMinutes: 20,
  cookMinutes: 25,
  restMinutes: 60,
  tags: ["Bread", "Baking"],
  keywords: ["focaccia", "rosemary"],
  notes: [],
  substitutions: [],
  equipment: [],
  artwork: "toast",
  example: false,
  ingredients: [
    { id: "ing-1", name: "bread flour", quantity: 500, unit: "g", note: "" },
    { id: "ing-2", name: "water", quantity: 400, unit: "ml", note: "" },
    { id: "ing-3", name: "extra virgin olive oil", quantity: 4, unit: "tbsp", note: "" },
  ],
  steps: [
    { id: "step-1", title: "Mix", instruction: "Mix flour, yeast, salt, and water." },
    { id: "step-2", title: "Dimple & Bake", instruction: "Dimple dough and bake at 425F." },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  cloudMocks.getSession.mockReset();
  cloudMocks.watchSession.mockClear();
  cloudMocks.loadAccountLibrary.mockReset();
  cloudMocks.loadAccountGrocerySession.mockReset();
  cloudMocks.loadRecipeById.mockReset().mockResolvedValue(null);
  cloudMocks.getOrCreateRecipeShare.mockReset().mockResolvedValue("tok-mock-12345");
  cloudMocks.loadRecipeByShareToken.mockReset().mockResolvedValue(null);
  cloudMocks.revokeRecipeShare.mockReset().mockResolvedValue(undefined);
  cloudMocks.saveAccountRecipe.mockReset().mockResolvedValue(undefined);
  cloudMocks.setAccountFavorite.mockReset().mockResolvedValue(undefined);
  cloudMocks.deleteAccountRecipe.mockReset().mockResolvedValue(undefined);
  cloudMocks.deleteRecipeCover.mockReset().mockResolvedValue(undefined);

  cloudMocks.getSession.mockResolvedValue(null);
  cloudMocks.loadAccountLibrary.mockResolvedValue({
    recipes: [],
    favorites: [],
    sharedRecipes: [],
    progress: {},
  });
  cloudMocks.loadAccountGrocerySession.mockResolvedValue({ session: null });
});

afterEach(cleanup);

describe("Shared Recipe Direct Link & Auth Gating", () => {
  it("loads and displays a shared cloud recipe when accessed by capability share link", async () => {
    cloudMocks.loadRecipeByShareToken.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/shared/test-token-abc");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "Grandma's Secret Focaccia" })).toBeInTheDocument();
    expect(cloudMocks.loadRecipeByShareToken).toHaveBeenCalledWith("test-token-abc");

    // Has Share button and Make it your own button
    expect(screen.getByRole("button", { name: "Share recipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make it your own" })).toBeInTheDocument();
  });

  it("blocks unauthenticated user with Google auth modal when clicking 'Make it your own'", async () => {
    const user = userEvent.setup();
    cloudMocks.loadRecipeByShareToken.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/shared/test-token-abc");

    render(<RecipeApp />);

    const makeYourOwnBtn = await screen.findByRole("button", { name: "Make it your own" });
    await user.click(makeYourOwnBtn);

    // Auth modal opens
    expect(screen.getByRole("dialog", { name: "Sign in to write your own recipes" })).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with Google to create and manage your recipes.")
    ).toBeInTheDocument();
  });

  it("opens share modal with copy link and native share options using capability token", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", {
      value: mockShare,
      configurable: true,
      writable: true,
    });

    cloudMocks.loadRecipeByShareToken.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/shared/test-token-abc");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "Grandma's Secret Focaccia" })).toBeInTheDocument();

    const shareBtn = await screen.findByRole("button", { name: "Share recipe" });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    // Share modal opens
    expect(screen.getByRole("heading", { name: "Share recipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy recipe link/i })).toBeInTheDocument();

    const shareViaAppsBtn = screen.getByRole("button", { name: /Share via apps/i });
    await act(async () => {
      fireEvent.click(shareViaAppsBtn);
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith({
      url: expect.stringContaining("#/shared/test-token-abc"),
      text: expect.stringContaining("#/shared/test-token-abc"),
    });
  });

  it("allows copying the capability share link from the share modal", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
      writable: true,
    });

    cloudMocks.loadRecipeByShareToken.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/shared/test-token-abc");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "Grandma's Secret Focaccia" })).toBeInTheDocument();

    const shareBtn = await screen.findByRole("button", { name: "Share recipe" });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    const copyBtn = screen.getByRole("button", { name: /Copy recipe link/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining("#/shared/test-token-abc")
    );
    expect(screen.getByText("Copied to clipboard!")).toBeInTheDocument();
  });

  it("generates capability share token when authenticated owner shares their recipe", async () => {
    const ownedRecipe = {
      ...mockSharedRecipe,
      id: "recipe-owned-999",
      title: "My Artisan Sourdough",
    };
    cloudMocks.getSession.mockResolvedValue({ user: { id: "user-owner-1" } });
    cloudMocks.loadAccountLibrary.mockResolvedValue({
      recipes: [ownedRecipe],
      favorites: [],
      sharedRecipes: [],
      progress: {},
    });
    cloudMocks.getOrCreateRecipeShare.mockResolvedValue("tok-secure-new-999");
    window.history.replaceState(null, "", "/recipe/#/recipe/recipe-owned-999");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "My Artisan Sourdough" })).toBeInTheDocument();

    const shareBtn = await screen.findByRole("button", { name: "Share recipe" });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(cloudMocks.getOrCreateRecipeShare).toHaveBeenCalledWith("recipe-owned-999");

    const copyBtn = screen.getByRole("button", { name: /Copy recipe link/i });
    expect(copyBtn).toBeInTheDocument();
  });

  it("displays missing recipe state when shared capability token is not found or invalid", async () => {
    cloudMocks.loadRecipeByShareToken.mockResolvedValue(null);
    window.history.replaceState(null, "", "/recipe/#/shared/unknown-token");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "This recipe isn't on the shelf." })).toBeInTheDocument();
    expect(cloudMocks.loadRecipeByShareToken).toHaveBeenCalledWith("unknown-token");
  });

  it("allows unauthenticated user to view AddRecipeModal and prompts login when any option is clicked", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/recipe/#/");

    render(<RecipeApp />);

    // Click Add recipe button in header
    const addRecipeBtn = screen.getByRole("button", { name: "Add recipe" });
    await user.click(addRecipeBtn);

    // Modal showcases the ways to add recipes
    expect(screen.getByText(/Choose how you'd like to add this recipe to your shelf:/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scan from photo/i })).toBeInTheDocument();

    // Clicking any option prompts the user to log in
    await user.click(screen.getByRole("button", { name: /Scan from photo/i }));

    // Auth modal is shown with intent 'create'
    expect(screen.getByRole("heading", { name: "Sign in to write your own recipes" })).toBeInTheDocument();
  });

  it("allows direct link loading for system recipes", async () => {
    window.history.replaceState(null, "", "/recipe/#/recipe/air-fryer-butter-lobster");

    render(<RecipeApp />);

    // System recipe exists in default shelf, should load directly without cloud RPC
    expect(await screen.findByRole("heading", { name: "Air fryer butter lobster" })).toBeInTheDocument();
  });

  it("allows authenticated user to favorite a shared recipe and view it in Favorites tab", async () => {
    cloudMocks.getSession.mockResolvedValue({ user: { id: "user-456" } });
    cloudMocks.loadAccountLibrary.mockResolvedValue({
      recipes: [],
      favorites: [],
      sharedRecipes: [],
      progress: {},
    });
    cloudMocks.loadRecipeByShareToken.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/shared/tok-focaccia-123");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "Grandma's Secret Focaccia" })).toBeInTheDocument();

    const favoriteBtn = screen.getByRole("button", { name: "Save to favorites" });
    await act(async () => {
      fireEvent.click(favoriteBtn);
    });

    expect(cloudMocks.setAccountFavorite).toHaveBeenCalledWith(
      "user-456",
      "shared-recipe-uuid-1234",
      true,
      "tok-focaccia-123",
    );

    // Navigate to shelf
    await act(async () => {
      window.location.hash = "#/";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(await screen.findByRole("heading", { name: /The recipe/i })).toBeInTheDocument();

    // Click Favorites tab
    const favoritesTab = screen.getByRole("button", { name: /^Favorites/i });
    await act(async () => {
      fireEvent.click(favoritesTab);
    });
    expect(screen.getByText("Grandma's Secret Focaccia")).toBeInTheDocument();

    // Click My recipes tab
    const myRecipesTab = screen.getByRole("button", { name: /^My recipes/i });
    await act(async () => {
      fireEvent.click(myRecipesTab);
    });
    // Should NOT be in My recipes because it was authored by someone else
    expect(screen.queryByText("Grandma's Secret Focaccia")).not.toBeInTheDocument();
  });

  it("migrates favorite to new recipe when user edits a favorited shared recipe via 'Make it your own'", async () => {
    const user = userEvent.setup();
    cloudMocks.getSession.mockResolvedValue({ user: { id: "user-456" } });
    cloudMocks.loadAccountLibrary.mockResolvedValue({
      recipes: [],
      favorites: ["shared-recipe-uuid-1234"],
      sharedRecipes: [mockSharedRecipe],
      progress: {},
    });
    cloudMocks.loadRecipeByShareToken.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/shared/tok-focaccia-123");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "Grandma's Secret Focaccia" })).toBeInTheDocument();

    // Click Make it your own
    const makeYourOwnBtn = screen.getByRole("button", { name: "Make it your own" });
    await user.click(makeYourOwnBtn);

    // Recipe editor opens
    expect(screen.getByRole("heading", { name: "Make it yours." })).toBeInTheDocument();

    // Edit title
    const titleInput = screen.getByLabelText(/Recipe name/i);
    await user.clear(titleInput);
    await user.type(titleInput, "My Custom Rosemary Focaccia");

    // Click Save recipe
    const saveBtn = screen.getByRole("button", { name: /Save recipe/i });
    await act(async () => {
      fireEvent.submit(saveBtn.closest("form"));
    });

    // saveAccountRecipe was called with new UUID recipe ID (not the original shared id)
    expect(cloudMocks.saveAccountRecipe).toHaveBeenCalledTimes(1);
    const savedRecipe = cloudMocks.saveAccountRecipe.mock.calls[0][1];
    expect(savedRecipe.id).not.toBe("shared-recipe-uuid-1234");
    expect(savedRecipe.id).toMatch(/^recipe-/);
    expect(savedRecipe.title).toBe("My Custom Rosemary Focaccia");

    // Unfavorites original and favorites the new one
    expect(cloudMocks.setAccountFavorite).toHaveBeenCalledWith(
      "user-456",
      "shared-recipe-uuid-1234",
      false
    );
    expect(cloudMocks.setAccountFavorite).toHaveBeenCalledWith(
      "user-456",
      savedRecipe.id,
      true
    );
  });

  it("allows navigating back from manual entry to AddRecipeModal", async () => {
    const user = userEvent.setup();
    cloudMocks.getSession.mockResolvedValue({ user: { id: "user-456" } });
    cloudMocks.loadAccountLibrary.mockResolvedValue({
      recipes: [],
      favorites: [],
      sharedRecipes: [],
      progress: {},
    });
    window.history.replaceState(null, "", "/recipe/#/");

    render(<RecipeApp />);

    // Click Add recipe
    const addRecipeBtn = await screen.findByRole("button", { name: "Add recipe" });
    await user.click(addRecipeBtn);

    // In Add recipe modal, click Manual entry
    const manualBtn = screen.getByRole("button", { name: /Manual entry/i });
    await user.click(manualBtn);

    // Recipe editor is open
    expect(screen.getByRole("heading", { name: "A new keeper." })).toBeInTheDocument();

    // Back button is present
    const backBtn = screen.getByRole("button", { name: "Back to creation options" });
    expect(backBtn).toBeInTheDocument();

    await user.click(backBtn);

    // Recipe editor is closed and AddRecipeModal is open again
    expect(screen.queryByRole("heading", { name: "A new keeper." })).not.toBeInTheDocument();
    expect(screen.getByText(/Choose how you'd like to add this recipe to your shelf:/i)).toBeInTheDocument();
  });

  it("retains and renders cached personal library when offline and displays user-friendly notice", async () => {
    const userId = "user-offline-cook";
    cloudMocks.getSession.mockResolvedValue({ user: { id: userId } });
    // Network fails to load cloud library
    cloudMocks.loadAccountLibrary.mockRejectedValue(new Error("Failed to fetch"));

    // Pre-seed offline cached library
    const cachedRecipe = {
      id: "cached-steak-id",
      title: "Offline Kitchen Ribeye",
      category: "Dinner",
      servings: 2,
      prepMinutes: 10,
      cookMinutes: 15,
      tags: ["Steak"],
      keywords: ["ribeye"],
      ingredients: [{ name: "ribeye steak", quantity: 1, unit: "lb" }],
      steps: [{ instruction: "Sear in hot cast iron skillet" }],
      artwork: "steak",
    };
    window.localStorage.setItem(
      `mise-library-v1:user:${userId}`,
      JSON.stringify({
        recipes: [cachedRecipe],
        favorites: ["cached-steak-id"],
        sharedRecipes: [],
        progress: {},
      }),
    );
    window.history.replaceState(null, "", "/recipe/#/");

    render(<RecipeApp />);

    // Personal recipe is still available from local cache
    expect(await screen.findByText("Offline Kitchen Ribeye")).toBeInTheDocument();

    // Friendly error notice and toast shown instead of raw 'Failed to fetch'
    const notices = await screen.findAllByText(
      "Couldn't reach your cookbook. Check your connection and try again.",
    );
    expect(notices.length).toBeGreaterThanOrEqual(1);
  });

  it("deletes superseded cover object from storage when recipe cover is replaced", async () => {
    const user = userEvent.setup();
    const userId = "user-cook-123";
    const existingRecipe = {
      ...mockSharedRecipe,
      id: "recipe-custom-1",
      artwork:
        "https://xyz.supabase.co/storage/v1/object/sign/recipe-covers/user-cook-123/recipe-custom-1-old.webp?token=old-token",
    };
    cloudMocks.getSession.mockResolvedValue({ user: { id: userId } });
    cloudMocks.loadAccountLibrary.mockResolvedValue({
      recipes: [existingRecipe],
      favorites: [],
      sharedRecipes: [],
      progress: {},
    });
    window.history.replaceState(null, "", "/recipe/#/recipe/recipe-custom-1");

    render(<RecipeApp />);

    expect(
      await screen.findByRole("heading", { name: existingRecipe.title }),
    ).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: "Edit recipe" });
    await user.click(editBtn);

    const coverInput = screen.getByPlaceholderText(/paste an image url/i);
    await user.clear(coverInput);
    await user.type(
      coverInput,
      "/recipe-covers/user-cook-123/recipe-custom-1-new.webp",
    );

    const saveBtn = screen.getByRole("button", { name: /Save recipe/i });
    await act(async () => {
      fireEvent.submit(saveBtn.closest("form"));
    });

    expect(cloudMocks.saveAccountRecipe).toHaveBeenCalledTimes(1);
    expect(cloudMocks.deleteRecipeCover).toHaveBeenCalledWith(
      existingRecipe.artwork,
    );
  });

  it("does not delete cover object if cover is unchanged upon saving", async () => {
    const user = userEvent.setup();
    const userId = "user-cook-123";
    const existingRecipe = {
      ...mockSharedRecipe,
      id: "recipe-custom-1",
      artwork:
        "https://xyz.supabase.co/storage/v1/object/sign/recipe-covers/user-cook-123/recipe-custom-1-same.webp?token=old-token",
    };
    cloudMocks.getSession.mockResolvedValue({ user: { id: userId } });
    cloudMocks.loadAccountLibrary.mockResolvedValue({
      recipes: [existingRecipe],
      favorites: [],
      sharedRecipes: [],
      progress: {},
    });
    window.history.replaceState(null, "", "/recipe/#/recipe/recipe-custom-1");

    render(<RecipeApp />);

    expect(
      await screen.findByRole("heading", { name: existingRecipe.title }),
    ).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: "Edit recipe" });
    await user.click(editBtn);

    const titleInput = screen.getByLabelText(/Recipe name/i);
    await user.clear(titleInput);
    await user.type(titleInput, "Updated Focaccia Title");

    const saveBtn = screen.getByRole("button", { name: /Save recipe/i });
    await act(async () => {
      fireEvent.submit(saveBtn.closest("form"));
    });

    expect(cloudMocks.saveAccountRecipe).toHaveBeenCalledTimes(1);
    expect(cloudMocks.deleteRecipeCover).not.toHaveBeenCalled();
  });

  it("deletes cover object from storage when an account recipe is deleted", async () => {
    const user = userEvent.setup();
    const userId = "user-cook-123";
    const existingRecipe = {
      ...mockSharedRecipe,
      id: "recipe-custom-1",
      artwork: "/recipe-covers/user-cook-123/recipe-custom-1-to-delete.webp",
    };
    cloudMocks.getSession.mockResolvedValue({ user: { id: userId } });
    cloudMocks.loadAccountLibrary.mockResolvedValue({
      recipes: [existingRecipe],
      favorites: [],
      sharedRecipes: [],
      progress: {},
    });
    window.history.replaceState(null, "", "/recipe/#/recipe/recipe-custom-1");

    render(<RecipeApp />);

    expect(
      await screen.findByRole("heading", { name: existingRecipe.title }),
    ).toBeInTheDocument();

    const editBtn = screen.getByRole("button", { name: "Edit recipe" });
    await user.click(editBtn);

    const deleteTrigger = screen.getByRole("button", { name: /Delete recipe/i });
    await user.click(deleteTrigger);

    const confirmDeleteBtn = screen.getByRole("button", {
      name: "Yes, delete",
    });
    await user.click(confirmDeleteBtn);

    expect(cloudMocks.deleteAccountRecipe).toHaveBeenCalledWith(
      userId,
      "recipe-custom-1",
    );
    expect(cloudMocks.deleteRecipeCover).toHaveBeenCalledWith(
      existingRecipe.artwork,
    );
  });
});

