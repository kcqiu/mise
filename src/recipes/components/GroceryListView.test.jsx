import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GroceryListView from "./GroceryListView";
import { EMPTY_GROCERY_SESSION } from "../groceries";

describe("GroceryListView Component", () => {
  const sampleRecipes = [
    {
      id: "fajitas",
      title: "Chicken Fajitas",
      servings: 2,
      artwork: "chicken",
      ingredients: [
        { name: "yellow onions (diced)", quantity: 1, unit: "", note: "" },
        { name: "chicken breast", quantity: 1, unit: "lb", note: "" },
        { name: "kosher salt", quantity: 1, unit: "tsp", note: "" },
      ],
    },
  ];

  it("renders empty state when there are no recipes or items", () => {
    render(
      <GroceryListView
        session={EMPTY_GROCERY_SESSION}
        recipes={sampleRecipes}
        onUpdateSession={vi.fn()}
      />
    );

    expect(screen.getByText("Your grocery list is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse recipes" })).toBeInTheDocument();
  });

  it("renders active recipes and aisle checklist when recipes are present", () => {
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
        onUpdateSession={vi.fn()}
      />
    );

    // Active recipe chip
    expect(screen.getByText("Chicken Fajitas")).toBeInTheDocument();
    expect(screen.getByText("2 serv")).toBeInTheDocument();

    // Aisles
    expect(screen.getByText("Produce")).toBeInTheDocument();
    expect(screen.getByText("Meat & Seafood")).toBeInTheDocument();

    // Aggregated items
    expect(screen.getByText("Yellow Onion")).toBeInTheDocument();
    expect(screen.getByText("Chicken Breast")).toBeInTheDocument();

    // Collapsible pantry staples
    expect(screen.getByText(/Pantry Staples/)).toBeInTheDocument();
  });

  it("adjusts servings when clicking stepper buttons", () => {
    const onUpdateSession = vi.fn();
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
        onUpdateSession={onUpdateSession}
      />
    );

    const plusBtn = screen.getByRole("button", { name: "Increase servings" });
    fireEvent.click(plusBtn);

    expect(onUpdateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        recipes: [{ recipeId: "fajitas", servings: 3, addedAt: 100 }],
      })
    );
  });

  it("toggles item checked state when clicking checkbox", () => {
    const onUpdateSession = vi.fn();
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
        onUpdateSession={onUpdateSession}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: /Mark Yellow Onion as purchased/ });
    fireEvent.click(checkbox);

    expect(onUpdateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        itemOverrides: expect.objectContaining({
          "food:onion:yellow": expect.objectContaining({
            status: "checked",
          }),
        }),
      })
    );
  });

  it("allows adding a custom ad-hoc item", () => {
    const onUpdateSession = vi.fn();
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
        onUpdateSession={onUpdateSession}
      />
    );

    const input = screen.getByRole("textbox", { name: "New grocery item" });
    fireEvent.change(input, { target: { value: "Sparkling water" } });

    const addBtn = screen.getByRole("button", { name: "Add" });
    fireEvent.click(addBtn);

    expect(onUpdateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customItems: expect.arrayContaining([
          expect.objectContaining({
            name: "Sparkling water",
            status: "unchecked",
          }),
        ]),
      })
    );
  });

  it("opens complete trip modal and allows clearing or rolling over", () => {
    const onUpdateSession = vi.fn();
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
        onUpdateSession={onUpdateSession}
      />
    );

    const completeBtn = screen.getByRole("button", { name: /Complete trip/ });
    fireEvent.click(completeBtn);

    expect(screen.getByRole("dialog", { name: "Complete Grocery Trip?" })).toBeInTheDocument();

    const clearBtn = screen.getByRole("button", { name: "Clear entire list" });
    fireEvent.click(clearBtn);

    expect(onUpdateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        recipes: [],
        customItems: [],
        itemOverrides: {},
      })
    );
  });

  it("renders sync status badge properly based on syncStatus prop", () => {
    const { rerender } = render(
      <GroceryListView
        session={EMPTY_GROCERY_SESSION}
        recipes={sampleRecipes}
        syncStatus="saved"
      />
    );
    expect(screen.getByText("Saved")).toBeInTheDocument();

    rerender(
      <GroceryListView
        session={EMPTY_GROCERY_SESSION}
        recipes={sampleRecipes}
        syncStatus="syncing"
      />
    );
    expect(screen.getByText("Syncing...")).toBeInTheDocument();

    rerender(
      <GroceryListView
        session={EMPTY_GROCERY_SESSION}
        recipes={sampleRecipes}
        syncStatus="offline"
      />
    );
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("disables complete trip action buttons and shows notice when offline", () => {
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
        syncStatus="offline"
      />
    );

    const completeBtn = screen.getByRole("button", { name: /Complete trip/ });
    fireEvent.click(completeBtn);

    expect(screen.getByText(/Offline Mode:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear entire list/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Keep unchecked items/ })).toBeDisabled();
  });

  it("dispatches typed mutation envelopes when onDispatchMutation is provided", () => {
    const onDispatchMutation = vi.fn();
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
        onDispatchMutation={onDispatchMutation}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: /Mark Yellow Onion as purchased/ });
    fireEvent.click(checkbox);

    expect(onDispatchMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ITEM_STATUS_CHANGED",
        targetId: "food:onion:yellow",
        payload: { status: "checked" },
      })
    );
  });

  it("opens share modal and allows copying formatted list to clipboard", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
      />
    );

    const shareBtn = screen.getByRole("button", { name: "Share or export grocery list" });
    fireEvent.click(shareBtn);

    expect(screen.getByRole("dialog", { name: "Share Grocery List" })).toBeInTheDocument();
    const copyBtn = screen.getByRole("button", { name: /Copy to Clipboard/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining("MISE Grocery List"));
  });

  it("opens aisle order modal and allows selecting store layout presets", () => {
    const session = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
    };

    render(
      <GroceryListView
        session={session}
        recipes={sampleRecipes}
      />
    );

    const organizeBtn = screen.getByRole("button", { name: "Organize aisle order" });
    fireEvent.click(organizeBtn);

    expect(screen.getByRole("dialog", { name: "Organize Aisle Order" })).toBeInTheDocument();
    expect(screen.getByText("Produce-First (Trader Joe's)")).toBeInTheDocument();
  });
});

