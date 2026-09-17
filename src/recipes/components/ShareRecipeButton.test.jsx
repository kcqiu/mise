import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ShareRecipeButton, { getShareUrl } from "./ShareRecipeButton";

const mockRecipe = {
  id: "salted-butter-roast-chicken",
  title: "Salted Butter Roast Chicken",
  description: "A golden, crisp-skinned roast chicken basted in salted herb butter.",
};

describe("ShareRecipeButton", () => {
  const originalNavigator = { ...global.navigator };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("constructs a canonical share URL using recipe ID", () => {
    const url = getShareUrl("my-recipe-123");
    expect(url).toContain("#/recipe/my-recipe-123");
  });

  it("returns null if recipe is missing", () => {
    const { container } = render(<ShareRecipeButton recipe={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders with default Share text and accessibility attributes", () => {
    render(<ShareRecipeButton recipe={mockRecipe} />);
    const button = screen.getByRole("button", { name: "Share recipe" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Share");
  });

  it("invokes navigator.share on mobile devices when available", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    const mockCanShare = vi.fn().mockReturnValue(true);

    Object.defineProperty(global, "navigator", {
      value: {
        ...originalNavigator,
        share: mockShare,
        canShare: mockCanShare,
      },
      configurable: true,
      writable: true,
    });

    render(<ShareRecipeButton recipe={mockRecipe} />);
    const button = screen.getByRole("button", { name: "Share recipe" });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Salted Butter Roast Chicken | mise.",
        text: mockRecipe.description,
        url: expect.stringContaining("#/recipe/salted-butter-roast-chicken"),
      })
    );
  });

  it("gracefully handles user cancellation (AbortError) in navigator.share", async () => {
    const abortError = new Error("User canceled share");
    abortError.name = "AbortError";
    const mockShare = vi.fn().mockRejectedValue(abortError);
    const onToast = vi.fn();

    Object.defineProperty(global, "navigator", {
      value: {
        ...originalNavigator,
        share: mockShare,
      },
      configurable: true,
      writable: true,
    });

    render(<ShareRecipeButton recipe={mockRecipe} onToast={onToast} />);
    const button = screen.getByRole("button", { name: "Share recipe" });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(onToast).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Share recipe" })).toHaveTextContent("Share");
  });

  it("copies to clipboard and displays transient feedback when navigator.share is unavailable", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    const onToast = vi.fn();

    Object.defineProperty(global, "navigator", {
      value: {
        ...originalNavigator,
        share: undefined,
        clipboard: {
          writeText: mockWriteText,
        },
      },
      configurable: true,
      writable: true,
    });

    render(<ShareRecipeButton recipe={mockRecipe} onToast={onToast} />);
    const button = screen.getByRole("button", { name: "Share recipe" });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining("#/recipe/salted-butter-roast-chicken")
    );
    expect(onToast).toHaveBeenCalledWith("Recipe link copied to clipboard", "info");

    const copiedButton = screen.getByRole("button", { name: "Recipe link copied" });
    expect(copiedButton).toHaveTextContent("Copied link!");

    // Advance timer by 2000ms
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole("button", { name: "Share recipe" })).toHaveTextContent("Share");
  });
});
