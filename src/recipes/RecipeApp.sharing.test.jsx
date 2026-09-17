import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloudMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  watchSession: vi.fn(() => () => {}),
  loadAccountLibrary: vi.fn(),
  loadAccountGrocerySession: vi.fn(),
  loadRecipeById: vi.fn(),
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
  cloudMocks.loadRecipeById.mockReset();

  cloudMocks.getSession.mockResolvedValue(null);
  cloudMocks.loadAccountLibrary.mockResolvedValue({
    recipes: [],
    favorites: [],
    progress: {},
  });
  cloudMocks.loadAccountGrocerySession.mockResolvedValue({ session: null });
});

afterEach(cleanup);

describe("Shared Recipe Direct Link & Auth Gating", () => {
  it("loads and displays a shared cloud recipe when accessed by direct link", async () => {
    cloudMocks.loadRecipeById.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/recipe/shared-recipe-uuid-1234");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "Grandma's Secret Focaccia" })).toBeInTheDocument();
    expect(cloudMocks.loadRecipeById).toHaveBeenCalledWith("shared-recipe-uuid-1234");

    // Has Share button and Make it your own button
    expect(screen.getByRole("button", { name: "Share recipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make it your own" })).toBeInTheDocument();
  });

  it("blocks unauthenticated user with Google auth modal when clicking 'Make it your own'", async () => {
    const user = userEvent.setup();
    cloudMocks.loadRecipeById.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/recipe/shared-recipe-uuid-1234");

    render(<RecipeApp />);

    const makeYourOwnBtn = await screen.findByRole("button", { name: "Make it your own" });
    await user.click(makeYourOwnBtn);

    // Auth modal opens
    expect(screen.getByRole("dialog", { name: "Sign in to write your own recipes" })).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with Google to create and manage your recipes.")
    ).toBeInTheDocument();
  });

  it("allows unauthenticated recipient to share the direct link", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(global.navigator, "share", {
      value: mockShare,
      configurable: true,
      writable: true,
    });

    cloudMocks.loadRecipeById.mockResolvedValue(mockSharedRecipe);
    window.history.replaceState(null, "", "/recipe/#/recipe/shared-recipe-uuid-1234");

    render(<RecipeApp />);

    const shareBtn = await screen.findByRole("button", { name: "Share recipe" });
    await act(async () => {
      fireEvent.click(shareBtn);
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Grandma's Secret Focaccia | mise.",
        url: expect.stringContaining("#/recipe/shared-recipe-uuid-1234"),
      })
    );
  });

  it("displays missing recipe state when shared recipe is not found in cloud", async () => {
    cloudMocks.loadRecipeById.mockResolvedValue(null);
    window.history.replaceState(null, "", "/recipe/#/recipe/unknown-recipe-id");

    render(<RecipeApp />);

    expect(await screen.findByRole("heading", { name: "This recipe isn't on the shelf." })).toBeInTheDocument();
    expect(cloudMocks.loadRecipeById).toHaveBeenCalledWith("unknown-recipe-id");
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
});

