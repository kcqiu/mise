import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeDetail from "./components/RecipeDetail";

describe("RecipeDetail unit conversion", () => {
  const mockRecipe = {
    id: "matcha-latte",
    title: "Iced Matcha Latte",
    category: "Drinks",
    cuisine: "Japanese",
    description: "Creamy iced matcha drink.",
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 0,
    restMinutes: 0,
    tags: ["Cold", "Quick"],
    keywords: ["matcha", "latte"],
    notes: [],
    substitutions: [],
    equipment: [],
    artwork: "spices",
    example: false,
    ingredients: [
      { id: "ing-1", name: "matcha", quantity: 5, unit: "g", note: "" },
      { id: "ing-2", name: "oat milk", quantity: 10, unit: "ml", note: "" },
      { id: "ing-3", name: "heavy cream", quantity: 60, unit: "ml", note: "" },
      { id: "ing-4", name: "ice", quantity: 1, unit: "cup", note: "" },
    ],
    steps: [
      { id: "step-1", title: "Whisk", instruction: "Whisk matcha with water." },
      { id: "step-2", title: "Pour", instruction: "Pour over ice and milk." },
    ],
  };

  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  it("renders the unit toggle pill with Original, US, and Metric options", () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        favorite={false}
        progress={{ ingredients: [], steps: [] }}
        onFavorite={vi.fn()}
        onProgress={vi.fn()}
        onEdit={vi.fn()}
        isLocal={true}
      />
    );

    expect(screen.getByRole("button", { name: "Original" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "US" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Metric" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("converts metric measurements to US kitchen units when US is selected", async () => {
    const user = userEvent.setup();
    render(
      <RecipeDetail
        recipe={mockRecipe}
        favorite={false}
        progress={{ ingredients: [], steps: [] }}
        onFavorite={vi.fn()}
        onProgress={vi.fn()}
        onEdit={vi.fn()}
        isLocal={true}
      />
    );

    // In Original mode: shows 10 ml oat milk and 60 ml heavy cream
    expect(screen.getByText(/10 ml/i)).toBeInTheDocument();
    expect(screen.getByText(/60 ml/i)).toBeInTheDocument();

    // Switch to US mode
    await user.click(screen.getByRole("button", { name: "US" }));

    // 10 ml -> 2 tsp, 60 ml -> 1/4 cup
    expect(screen.getByText(/2 tsp/i)).toBeInTheDocument();
    expect(screen.getByText(/1\/4 cup/i)).toBeInTheDocument();
    // 1 cup ice remains 1 cup ice
    expect(screen.getByText(/1 cup/i)).toBeInTheDocument();
  });

  it("converts US measurements to Metric when Metric is selected", async () => {
    const user = userEvent.setup();
    render(
      <RecipeDetail
        recipe={mockRecipe}
        favorite={false}
        progress={{ ingredients: [], steps: [] }}
        onFavorite={vi.fn()}
        onProgress={vi.fn()}
        onEdit={vi.fn()}
        isLocal={true}
      />
    );

    // Switch to Metric mode
    await user.click(screen.getByRole("button", { name: "Metric" }));

    // 1 cup ice -> 240 ml ice
    expect(screen.getByText(/240 ml/i)).toBeInTheDocument();
    // 10 ml oat milk stays 10 ml
    expect(screen.getByText(/10 ml/i)).toBeInTheDocument();
  });

  it("allows checking off ingredients regardless of active unit system", async () => {
    const user = userEvent.setup();
    const handleProgress = vi.fn();
    render(
      <RecipeDetail
        recipe={mockRecipe}
        favorite={false}
        progress={{ ingredients: [], steps: [] }}
        onFavorite={vi.fn()}
        onProgress={handleProgress}
        onEdit={vi.fn()}
        isLocal={true}
      />
    );

    // Switch to US mode
    await user.click(screen.getByRole("button", { name: "US" }));

    // Tap on the converted ingredient item (e.g. 2 tsp oat milk)
    const oatMilkItem = screen.getByText(/oat milk/i);
    await user.click(oatMilkItem);

    expect(handleProgress).toHaveBeenCalledWith({
      ingredients: ["ing-2"],
      steps: [],
    });
  });
});
