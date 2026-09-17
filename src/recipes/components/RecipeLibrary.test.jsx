import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeLibrary from "./RecipeLibrary";

const mockRecipes = [
  {
    id: "system-1",
    title: "Crispy Lemon Chicken",
    category: "Dinner",
    description: "Lemon chicken",
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 4,
    tags: ["chicken"],
    keywords: [],
    ingredients: [],
    steps: [],
  },
  {
    id: "personal-1",
    title: "Grandma's Meatballs",
    category: "Dinner",
    description: "Family meatballs",
    prepMinutes: 15,
    cookMinutes: 30,
    servings: 6,
    tags: ["meat"],
    keywords: [],
    ingredients: [],
    steps: [],
  },
  {
    id: "personal-2",
    title: "Homemade Sourdough",
    category: "Baking",
    description: "Sourdough bread",
    prepMinutes: 30,
    cookMinutes: 45,
    servings: 8,
    tags: ["bread"],
    keywords: [],
    ingredients: [],
    steps: [],
  },
];

describe("RecipeLibrary", () => {
  const defaultState = {
    query: "",
    category: "",
    collection: "all",
    sort: "collection",
  };

  it("does not render 'My recipes' tab when user is not logged in", () => {
    render(
      <RecipeLibrary
        recipes={mockRecipes}
        favorites={[]}
        onFavorite={vi.fn()}
        state={defaultState}
        onState={vi.fn()}
        isLoggedIn={false}
        personalRecipeIds={new Set()}
      />
    );

    expect(screen.queryByRole("button", { name: "My recipes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All recipes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorites" })).toBeInTheDocument();
  });

  it("renders 'My recipes' tab when user is logged in", () => {
    render(
      <RecipeLibrary
        recipes={mockRecipes}
        favorites={[]}
        onFavorite={vi.fn()}
        state={defaultState}
        onState={vi.fn()}
        isLoggedIn={true}
        personalRecipeIds={new Set(["personal-1", "personal-2"])}
      />
    );

    expect(screen.getByRole("button", { name: "My recipes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All recipes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Favorites" })).toBeInTheDocument();
  });

  it("calls onState with collection 'my-recipes' when clicking 'My recipes'", async () => {
    const user = userEvent.setup();
    const handleState = vi.fn();

    render(
      <RecipeLibrary
        recipes={mockRecipes}
        favorites={[]}
        onFavorite={vi.fn()}
        state={defaultState}
        onState={handleState}
        isLoggedIn={true}
        personalRecipeIds={new Set(["personal-1", "personal-2"])}
      />
    );

    await user.click(screen.getByRole("button", { name: "My recipes" }));
    expect(handleState).toHaveBeenCalledWith({
      ...defaultState,
      collection: "my-recipes",
    });
  });

  it("filters to only personal recipes and displays 'Your recipes' label when collection is 'my-recipes'", () => {
    render(
      <RecipeLibrary
        recipes={mockRecipes}
        favorites={[]}
        onFavorite={vi.fn()}
        state={{ ...defaultState, collection: "my-recipes" }}
        onState={vi.fn()}
        isLoggedIn={true}
        personalRecipeIds={new Set(["personal-1", "personal-2"])}
      />
    );

    expect(screen.getByText("Your recipes")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grandma's Meatballs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Homemade Sourdough" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Crispy Lemon Chicken" })).not.toBeInTheDocument();
  });

  it("displays empty state when collection is 'my-recipes' and user has no personal recipes", async () => {
    const user = userEvent.setup();
    const handleAdd = vi.fn();

    render(
      <RecipeLibrary
        recipes={mockRecipes}
        favorites={[]}
        onFavorite={vi.fn()}
        state={{ ...defaultState, collection: "my-recipes" }}
        onState={vi.fn()}
        isLoggedIn={true}
        personalRecipeIds={new Set()}
        onAdd={handleAdd}
      />
    );

    expect(screen.getByRole("heading", { name: "No recipes created yet." })).toBeInTheDocument();
    expect(screen.getByText(/Add your own family favorites or experimental dishes/i)).toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: "Add a recipe" });
    await user.click(addBtn);
    expect(handleAdd).toHaveBeenCalledTimes(1);
  });
});
