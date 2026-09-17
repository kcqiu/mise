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

  it("opens share modal with link preview and copy button when clicked", async () => {
    render(<ShareRecipeButton recipe={mockRecipe} />);
    const trigger = screen.getByRole("button", { name: "Share recipe" });

    await act(async () => {
      fireEvent.click(trigger);
    });

    expect(screen.getByRole("heading", { name: "Share recipe" })).toBeInTheDocument();
    const linkInput = screen.getByLabelText("Recipe share link");
    expect(linkInput.value).toContain("#/recipe/salted-butter-roast-chicken");
    expect(screen.getByRole("button", { name: /Copy recipe link/i })).toBeInTheDocument();
  });

  it("copies link to clipboard and provides visual feedback when Copy recipe link is clicked", async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    const onToast = vi.fn();

    Object.defineProperty(global, "navigator", {
      value: {
        ...originalNavigator,
        clipboard: {
          writeText: mockWriteText,
        },
      },
      configurable: true,
      writable: true,
    });

    render(<ShareRecipeButton recipe={mockRecipe} onToast={onToast} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share recipe" }));
    });

    const copyBtn = screen.getByRole("button", { name: /Copy recipe link/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining("#/recipe/salted-butter-roast-chicken")
    );
    expect(onToast).toHaveBeenCalledWith("Recipe link copied to clipboard", "info");
    expect(screen.getByText("Copied to clipboard!")).toBeInTheDocument();

    // Advance timer by 2000ms to verify reverted label
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Copy recipe link")).toBeInTheDocument();
  });

  it("invokes navigator.share with url only (no page title) when Share via apps is clicked", async () => {
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share recipe" }));
    });

    const appsBtn = screen.getByRole("button", { name: /Share via apps\.\.\./i });
    expect(appsBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(appsBtn);
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    // Crucial check: title should NOT be included in share payload so mobile "Copy" doesn't copy title
    const sharePayload = mockShare.mock.calls[0][0];
    expect(sharePayload.url).toContain("#/recipe/salted-butter-roast-chicken");
    expect(sharePayload.title).toBeUndefined();
  });

  it("closes modal on close button click and escape key", async () => {
    render(<ShareRecipeButton recipe={mockRecipe} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share recipe" }));
    });
    expect(screen.getByRole("heading", { name: "Share recipe" })).toBeInTheDocument();

    // Close via close button
    const closeBtn = screen.getByRole("button", { name: "Close dialog" });
    await act(async () => {
      fireEvent.click(closeBtn);
    });
    expect(screen.queryByRole("heading", { name: "Share recipe" })).not.toBeInTheDocument();

    // Reopen and close via Escape
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Share recipe" }));
    });
    expect(screen.getByRole("heading", { name: "Share recipe" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("heading", { name: "Share recipe" })).not.toBeInTheDocument();
  });
});
