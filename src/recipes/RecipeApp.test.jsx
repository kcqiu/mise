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
import { STORAGE_KEY_GROCERIES } from "./groceries";

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
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});
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

  it("returns to the shelf and searches when a recipe tag is selected", async () => {
    const user = userEvent.setup();
    render(<RecipeApp />);
    await route("garlic-butter-ribeye");

    await user.click(screen.getByRole("button", { name: "Steak" }));

    expect(window.location.hash).toBe("#/");
    expect(await screen.findByRole("searchbox")).toHaveValue("Steak");
    expect(
      screen.getByRole("heading", { name: "Garlic butter ribeye" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Crispy lemon chicken" }),
    ).not.toBeInTheDocument();
  });

  it("explains an empty favorites shelf and offers the next action", async () => {
    const user = userEvent.setup();
    render(<RecipeApp />);

    await user.click(screen.getByRole("button", { name: "Favorites" }));

    expect(
      screen.getByRole("heading", { name: "No favorites yet." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Save a recipe with the bookmark to keep it here."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Browse all recipes" }),
    ).toBeInTheDocument();
  });

  it("offers to clear filters when a search has no results", async () => {
    const user = userEvent.setup();
    render(<RecipeApp />);

    await user.type(screen.getByRole("searchbox"), "definitely-not-a-recipe");

    expect(
      screen.getByRole("heading", { name: "No recipes found." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Try another ingredient or clear your filters."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
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
  }, 15000);
  it("handles invalid deep links", async () => {
    render(<RecipeApp />);
    await route("missing-recipe");
    expect(
      screen.getByRole("heading", { name: "This recipe isn't on the shelf." }),
    ).toBeInTheDocument();
  });
  it("does not render import recipe file inputs", () => {
    render(<RecipeApp />);
    expect(
      screen.queryByLabelText("Import recipe file or backup"),
    ).not.toBeInTheDocument();
  });

  it("does not render My recipes filter tab for unauthenticated user", () => {
    render(<RecipeApp />);
    expect(screen.queryByRole("button", { name: "My recipes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All recipes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorites" })).toBeInTheDocument();
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


  it("waits on the first grocery visit, then returns dismissed guests to the shelf", async () => {
    vi.useFakeTimers();
    render(<RecipeApp />);

    await act(async () => {
      window.location.hash = "/groceries";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(screen.getByRole("heading", { name: "Grocery List" })).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(
      screen.queryByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem("mise-groceries-auth-prompt-seen-v1"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(
      screen.getByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).toBeInTheDocument();
    expect(
      window.localStorage.getItem("mise-groceries-auth-prompt-seen-v1"),
    ).toBe("true");

    fireEvent.click(
      screen.getByRole("button", { name: "Continue browsing as guest" }),
    );

    expect(window.location.hash).toBe("#/");
    expect(
      screen.queryByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).not.toBeInTheDocument();
  });

  it("blocks later grocery visits immediately after guest dismissal", async () => {
    window.localStorage.setItem("mise-groceries-auth-prompt-seen-v1", "true");
    window.history.replaceState(null, "", "/recipe/#/groceries");
    render(<RecipeApp />);

    expect(
      await screen.findByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue browsing as guest" }),
    );
    expect(window.location.hash).toBe("#/");
    expect(
      screen.queryByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).not.toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await act(async () => {
      window.location.hash = "/groceries";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(
      await screen.findByRole("heading", { name: "Sign in to keep your grocery list" }),
    ).toBeInTheDocument();
  });

  it("emits exactly one toast when a guest clears a grocery trip", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY_GROCERIES,
      JSON.stringify({
        id: "guest-trip",
        status: "active",
        revision: 1,
        recipes: [],
        customItems: [
          {
            id: "coffee",
            name: "Coffee beans",
            quantity: null,
            unit: "",
            category: "Pantry",
            note: "",
            status: "unchecked",
            updatedAt: 1,
          },
        ],
        itemOverrides: {},
      }),
    );
    window.history.replaceState(null, "", "/recipe/#/groceries");

    render(<RecipeApp />);
    await user.click(screen.getByRole("button", { name: /Complete trip/ }));
    await user.click(screen.getByRole("button", { name: "Clear entire list" }));

    expect(await screen.findByText("Grocery list cleared")).toBeInTheDocument();
    expect(screen.getAllByText("Grocery list cleared")).toHaveLength(1);
  });

  it("emits exactly one toast when a guest rolls over remaining items", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      STORAGE_KEY_GROCERIES,
      JSON.stringify({
        id: "guest-trip",
        status: "active",
        revision: 1,
        recipes: [],
        customItems: [
          {
            id: "coffee",
            name: "Coffee beans",
            quantity: null,
            unit: "",
            category: "Pantry",
            note: "",
            status: "unchecked",
            updatedAt: 1,
          },
        ],
        itemOverrides: {},
      }),
    );
    window.history.replaceState(null, "", "/recipe/#/groceries");

    render(<RecipeApp />);
    await user.click(screen.getByRole("button", { name: /Complete trip/ }));
    await user.click(screen.getByRole("button", { name: /Keep unpurchased items/ }));

    const message = "Completed trip; unpurchased items rolled over";
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getAllByText(message)).toHaveLength(1);
  });
});
