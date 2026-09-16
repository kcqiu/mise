import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeApp from "./RecipeApp";
import { STORAGE_KEY } from "./library";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/recipe/");
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);
async function route(id) {
  await act(async () => {
    window.location.hash = `/recipe/${id}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe("personal recipe workflows", () => {
  it("keeps the production header free of the retired caption", () => {
    render(<RecipeApp />);

    expect(
      screen.getByRole("link", { name: "mise. recipe shelf" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Recipes, kept close.")).not.toBeInTheDocument();
  });

  it("filters immediately and saves a favorite across reloads", async () => {
    const user = userEvent.setup();
    const view = render(<RecipeApp />);
    await user.type(screen.getByRole("searchbox"), "beef");
    expect(
      screen.getByRole("heading", { name: "Garlic butter ribeye" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Crispy lemon chicken" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Save Garlic butter ribeye to favorites",
      }),
    );
    view.unmount();
    render(<RecipeApp />);
    await user.click(screen.getByRole("button", { name: /Favorites/ }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "Garlic butter ribeye" }),
    ).toBeInTheDocument();
  });
  it("scales ingredients and remembers cooking checklists", async () => {
    const user = userEvent.setup();
    render(<RecipeApp />);
    await route("garlic-butter-ribeye");
    await user.click(screen.getByRole("button", { name: "More servings" }));
    expect(screen.getByLabelText("Adjusted servings")).toHaveTextContent("3");
    expect(screen.getByText("675 g")).toBeInTheDocument();
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(
      screen.getByRole("button", { name: "Mark step 1 complete" }),
    );
    expect(
      screen.getByRole("button", { name: "Mark step 1 incomplete" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)).progress[
        "garlic-butter-ribeye"
      ].steps,
    ).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "Reset cooking checklist" }),
    );
    expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked();
  });
  it("adds an original recipe with a new category and an image-free design", async () => {
    const user = userEvent.setup();
    render(<RecipeApp />);
    await user.click(screen.getByRole("button", { name: "Add recipe" }));
    await user.click(screen.getByRole("button", { name: /Manual entry/i }));
    const dialog = screen.getByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Recipe name"),
      "My lemon dressing",
    );
    fireEvent.change(within(dialog).getByLabelText("Category"), {
      target: { value: "Sauces" },
    });
    await user.type(
      within(dialog).getByLabelText("Ingredient 1 name"),
      "Lemon juice",
    );
    await user.type(
      within(dialog).getByLabelText("Step 1 instructions"),
      "Whisk everything together.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save recipe" }),
    );
    expect(
      await screen.findByRole("heading", { name: "My lemon dressing" }),
    ).toBeInTheDocument();
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY)).recipes[0].category,
    ).toBe("Sauces");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("handles invalid deep links", async () => {
    render(<RecipeApp />);
    await route("missing-recipe");
    expect(
      screen.getByRole("heading", { name: "This recipe isn't on the shelf." }),
    ).toBeInTheDocument();
  });
  it("imports a single recipe JSON file directly into the editor", async () => {
    const user = userEvent.setup();
    render(<RecipeApp />);
    const fileInput = screen.getByLabelText("Import recipe file or backup");
    const singleRecipe = {
      id: "imported-skillet-eggs",
      title: "Imported Skillet Eggs",
      category: "Breakfast",
      description: "Eggs cooked in a cast iron skillet",
      cuisine: "American",
      method: "Stovetop",
      sourceVideo: "",
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 5,
      restMinutes: 0,
      tags: ["quick"],
      keywords: ["eggs"],
      notes: [],
      substitutions: [],
      equipment: ["Skillet"],
      artwork: "",
      example: false,
      ingredients: [{ name: "Eggs", quantity: 4, unit: "", note: "", group: "" }],
      steps: [{ title: "Fry", instruction: "Fry eggs until set." }],
    };

    const file = new File([JSON.stringify(singleRecipe)], "skillet-eggs.json", {
      type: "application/json",
    });

    await user.upload(fileInput, file);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Recipe name")).toHaveValue(
      "Imported Skillet Eggs",
    );
  });

  it("sorts recipes by latest added by default on the shelf", () => {
    const olderRecipe = {
      id: "recipe-older",
      title: "Older Added Recipe",
      category: "Breakfast",
      description: "",
      cuisine: "",
      method: "",
      sourceVideo: "",
      servings: 1,
      prepMinutes: 5,
      cookMinutes: 5,
      restMinutes: 0,
      tags: [],
      keywords: [],
      notes: [],
      substitutions: [],
      equipment: [],
      artwork: "",
      example: false,
      createdAt: "2026-09-10T10:00:00.000Z",
      ingredients: [{ id: "ing-1", name: "Toast", quantity: 1, unit: "", note: "", group: "" }],
      steps: [{ id: "step-1", title: "Toast", instruction: "Toast bread." }],
    };
    const newerRecipe = {
      id: "recipe-newer",
      title: "Newer Added Recipe",
      category: "Dinner",
      description: "",
      cuisine: "",
      method: "",
      sourceVideo: "",
      servings: 2,
      prepMinutes: 10,
      cookMinutes: 10,
      restMinutes: 0,
      tags: [],
      keywords: [],
      notes: [],
      substitutions: [],
      equipment: [],
      artwork: "",
      example: false,
      createdAt: "2026-09-14T12:00:00.000Z",
      ingredients: [{ id: "ing-1", name: "Pasta", quantity: 200, unit: "g", note: "", group: "" }],
      steps: [{ id: "step-1", title: "Boil", instruction: "Boil pasta." }],
    };

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        recipes: [olderRecipe, newerRecipe],
        favorites: [],
        progress: {},
      })
    );

    render(<RecipeApp />);

    const grid = document.querySelector(".recipe-grid--shelf");
    const articles = within(grid).getAllByRole("article");

    // The sorted list is rendered in order: newest first
    expect(within(articles[0]).getByText("Newer Added Recipe")).toBeInTheDocument();
    expect(within(articles[1]).getByText("Older Added Recipe")).toBeInTheDocument();
  });


  it("navigates to groceries route and triggers auth modal for guest", async () => {
    vi.useFakeTimers();
    render(<RecipeApp />);

    await act(async () => {
      window.location.hash = "/groceries";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(screen.getByRole("heading", { name: "Grocery List" })).toBeInTheDocument();

    // Fast-forward 10 seconds
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Auth modal should open with groceries intent
    expect(
      screen.getByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).toBeInTheDocument();

    // Dismiss auth modal as guest
    const closeBtn = screen.getByRole("button", { name: /Close sign-in dialog/i });
    fireEvent.click(closeBtn);

    // Should redirect back to shelf #/
    expect(window.location.hash).toBe("#/");

    vi.useRealTimers();
  });
});
