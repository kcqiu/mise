import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecipeDetail from "./RecipeDetail";

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

  it("renders Add to Groceries button and triggers onToggleGroceries when clicked", async () => {
    const user = userEvent.setup();
    const handleToggleGroceries = vi.fn();

    render(
      <RecipeDetail
        recipe={mockRecipe}
        favorite={false}
        progress={{ ingredients: [], steps: [] }}
        onFavorite={vi.fn()}
        onProgress={vi.fn()}
        onEdit={vi.fn()}
        isLocal={true}
        inGroceries={false}
        onToggleGroceries={handleToggleGroceries}
      />
    );

    const groceryBtns = screen.getAllByRole("button", { name: "Add to Groceries" });
    expect(groceryBtns).toHaveLength(1);

    await user.click(groceryBtns[0]);
    expect(handleToggleGroceries).toHaveBeenCalledWith("matcha-latte", 2);
  });

  it("reports the selected tag through an accessible button", async () => {
    const user = userEvent.setup();
    const handleSearchTag = vi.fn();

    render(
      <RecipeDetail
        recipe={mockRecipe}
        favorite={false}
        progress={{ ingredients: [], steps: [] }}
        onFavorite={vi.fn()}
        onProgress={vi.fn()}
        onEdit={vi.fn()}
        onSearchTag={handleSearchTag}
        isLocal={true}
      />
    );

    await user.click(screen.getByRole("button", { name: "Quick" }));

    expect(handleSearchTag).toHaveBeenCalledOnce();
    expect(handleSearchTag).toHaveBeenCalledWith("Quick");
  });

  it("renders the Share button next to Edit recipe for local recipes", () => {
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

    const shareButton = screen.getByRole("button", { name: "Share recipe" });
    const editButton = screen.getByRole("button", { name: "Edit recipe" });
    expect(shareButton).toBeInTheDocument();
    expect(editButton).toBeInTheDocument();
  });

  it("renders the Share button next to Make it your own for non-local recipes", () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        favorite={false}
        progress={{ ingredients: [], steps: [] }}
        onFavorite={vi.fn()}
        onProgress={vi.fn()}
        onEdit={vi.fn()}
        isLocal={false}
      />
    );

    const shareButton = screen.getByRole("button", { name: "Share recipe" });
    const makeYourOwnButton = screen.getByRole("button", { name: "Make it your own" });
    expect(shareButton).toBeInTheDocument();
    expect(makeYourOwnButton).toBeInTheDocument();
  });

  describe("keep screen awake toggle", () => {
    let originalWakeLock;
    let mockLock;

    beforeEach(() => {
      originalWakeLock = navigator.wakeLock;
      mockLock = {
        released: false,
        release: vi.fn(async function () {
          mockLock.released = true;
          if (this._onrelease) this._onrelease();
        }),
        addEventListener: vi.fn((event, callback) => {
          if (event === "release") {
            mockLock._onrelease = callback;
          }
        }),
        removeEventListener: vi.fn(),
      };
    });

    afterEach(() => {
      if (originalWakeLock !== undefined) {
        Object.defineProperty(navigator, "wakeLock", {
          value: originalWakeLock,
          configurable: true,
          writable: true,
        });
      } else {
        delete navigator.wakeLock;
      }
      vi.restoreAllMocks();
    });

    it("does not render awake toggle when wakeLock is unsupported", () => {
      delete navigator.wakeLock;
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

      expect(screen.queryByRole("button", { name: /keep screen awake/i })).not.toBeInTheDocument();
    });

    it("renders awake toggle and toggles active state when clicked", async () => {
      const user = userEvent.setup();
      const requestMock = vi.fn().mockResolvedValue(mockLock);
      Object.defineProperty(navigator, "wakeLock", {
        value: { request: requestMock },
        configurable: true,
        writable: true,
      });

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

      const toggleBtn = screen.getByRole("button", { name: /keep screen awake/i });
      expect(toggleBtn).toBeInTheDocument();
      expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
      expect(toggleBtn.classList.contains("active")).toBe(false);

      // Click to enable
      await user.click(toggleBtn);
      expect(requestMock).toHaveBeenCalledWith("screen");
      expect(toggleBtn).toHaveAttribute("aria-pressed", "true");
      expect(toggleBtn.classList.contains("active")).toBe(true);
      expect(screen.getByText("Screen stays awake")).toBeInTheDocument();

      // Click to disable
      await user.click(toggleBtn);
      expect(mockLock.release).toHaveBeenCalled();
      expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
      expect(toggleBtn.classList.contains("active")).toBe(false);
      expect(screen.getByText("Keep screen awake")).toBeInTheDocument();
    });

    it("shows device warning if wakeLock request is denied", async () => {
      const user = userEvent.setup();
      const requestMock = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
      Object.defineProperty(navigator, "wakeLock", {
        value: { request: requestMock },
        configurable: true,
        writable: true,
      });

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

      const toggleBtn = screen.getByRole("button", { name: /keep screen awake/i });
      await user.click(toggleBtn);

      expect(toggleBtn).toHaveAttribute("aria-pressed", "false");
      expect(
        screen.getByText(/couldn't keep the screen awake/i)
      ).toBeInTheDocument();
    });
  });
});

