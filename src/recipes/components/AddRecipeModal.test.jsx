import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddRecipeModal from "./AddRecipeModal";
import * as aiModule from "../ai";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AddRecipeModal intake hub", () => {
  it("renders all 5 intake pathways with titles and descriptive subheadings", () => {
    render(
      <AddRecipeModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectManual={vi.fn()}
        onParsedRecipe={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "The recipe intake." })).toBeInTheDocument();

    // 1. Manual entry
    expect(screen.getByRole("button", { name: /Manual entry/i })).toBeInTheDocument();
    expect(screen.getByText(/Write from scratch with your own measurements/i)).toBeInTheDocument();

    // 2. Scan from photo
    expect(screen.getByRole("button", { name: /Scan from photo/i })).toBeInTheDocument();
    expect(screen.getByText(/Upload a snapshot of a handwritten card/i)).toBeInTheDocument();

    // 3. Paste from text
    expect(screen.getByRole("button", { name: /Paste from text/i })).toBeInTheDocument();
    expect(screen.getByText(/Paste rough notes, messy ingredients dumps/i)).toBeInTheDocument();

    // 4. From recipe website
    expect(screen.getByRole("button", { name: /From recipe website/i })).toBeInTheDocument();
    expect(screen.getByText(/Import from NYT Cooking, Serious Eats/i)).toBeInTheDocument();

    // 5. From TikTok, Instagram, or YouTube
    expect(screen.getByRole("button", { name: /From TikTok, Instagram, or YouTube/i })).toBeInTheDocument();
    expect(screen.getByText(/Gemini extracts the recipe from the caption/i)).toBeInTheDocument();
  });

  it("triggers onSelectManual when Manual entry is clicked", async () => {
    const user = userEvent.setup();
    const handleSelectManual = vi.fn();
    const handleClose = vi.fn();

    render(
      <AddRecipeModal
        isOpen={true}
        onClose={handleClose}
        onSelectManual={handleSelectManual}
        onParsedRecipe={vi.fn()}
        onError={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Manual entry/i }));
    expect(handleSelectManual).toHaveBeenCalledTimes(1);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("navigates to text paste view, allows typing, parses with Gemini, and navigates back", async () => {
    const user = userEvent.setup();
    const handleParsed = vi.fn();
    const handleClose = vi.fn();

    const mockRecipe = {
      title: "Lemon Butter Chicken",
      category: "Dinner",
      ingredients: [{ name: "chicken breasts", quantity: 2, unit: "lbs" }],
      steps: [{ title: "Sear", instruction: "Pan sear with butter." }],
    };
    vi.spyOn(aiModule, "parseRecipeFromText").mockResolvedValueOnce(mockRecipe);

    render(
      <AddRecipeModal
        isOpen={true}
        onClose={handleClose}
        onSelectManual={vi.fn()}
        onParsedRecipe={handleParsed}
        onError={vi.fn()}
      />
    );

    // Click Paste from text
    await user.click(screen.getByRole("button", { name: /Paste from text/i }));
    expect(screen.getByRole("heading", { name: "Paste from text" })).toBeInTheDocument();

    // Fill textarea
    const textarea = screen.getByPlaceholderText(/Paste recipe text here/i);
    await user.type(textarea, "Lemon Butter Chicken: 2 lbs chicken. Pan sear with butter.");

    // Submit
    await user.click(screen.getByRole("button", { name: /Parse with Gemini/i }));

    expect(aiModule.parseRecipeFromText).toHaveBeenCalledWith("Lemon Butter Chicken: 2 lbs chicken. Pan sear with butter.");
    expect(handleParsed).toHaveBeenCalledWith(mockRecipe);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("navigates to website URL view and displays supported platform tags", async () => {
    const user = userEvent.setup();

    render(
      <AddRecipeModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectManual={vi.fn()}
        onParsedRecipe={vi.fn()}
        onError={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /From recipe website/i }));
    expect(screen.getByRole("heading", { name: "From recipe website" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/seriouseats\.com/i)).toBeInTheDocument();
    expect(screen.queryByText(/Works with:/i)).not.toBeInTheDocument();

    // Click back to menu
    await user.click(screen.getByRole("button", { name: "Back to creation options" }));
    expect(screen.getByRole("heading", { name: "The recipe intake." })).toBeInTheDocument();
  });

  it("navigates to social video view and displays supported video platforms", async () => {
    const user = userEvent.setup();

    render(
      <AddRecipeModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectManual={vi.fn()}
        onParsedRecipe={vi.fn()}
        onError={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /From TikTok, Instagram, or YouTube/i }));
    expect(screen.getByRole("heading", { name: "From TikTok, Instagram, or YouTube" })).toBeInTheDocument();
    expect(screen.getByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Instagram Reels")).toBeInTheDocument();
    expect(screen.getByText("YouTube / Shorts")).toBeInTheDocument();
  });

  it("does not render import file footer or backup options", () => {
    render(
      <AddRecipeModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectManual={vi.fn()}
        onParsedRecipe={vi.fn()}
      />
    );

    expect(screen.queryByText(/Have an existing recipe JSON or backup file\?/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import file/i })).not.toBeInTheDocument();
  });

  it("displays Instagram caption input when Instagram URL is typed and submits with caption", async () => {
    const user = userEvent.setup();
    const handleParsed = vi.fn();
    const handleClose = vi.fn();

    const mockRecipe = {
      title: "Ube Matcha Latte",
      category: "Drinks",
      ingredients: [{ name: "matcha", quantity: 1, unit: "tsp" }],
      steps: [{ title: "Whisk", instruction: "Whisk matcha." }],
    };
    vi.spyOn(aiModule, "parseRecipeFromSocial").mockResolvedValueOnce(mockRecipe);

    render(
      <AddRecipeModal
        isOpen={true}
        onClose={handleClose}
        onSelectManual={vi.fn()}
        onParsedRecipe={handleParsed}
        onError={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /From TikTok, Instagram, or YouTube/i }));

    const urlInput = screen.getByPlaceholderText(/tiktok\.com/i);
    await user.type(urlInput, "https://www.instagram.com/reel/CvvEAHStYXS/");

    // The caption textarea should now appear
    expect(screen.getByText(/Recommended for Instagram/i)).toBeInTheDocument();
    const captionInput = screen.getByPlaceholderText(/Paste the caption or ingredient list/i);
    expect(captionInput).toBeInTheDocument();

    await user.type(captionInput, "Ube matcha latte: 1/8 tsp ube extract, 1 cup milk, 1 tsp matcha");

    // Click Extract & Embed
    await user.click(screen.getByRole("button", { name: /Extract & Embed/i }));

    expect(aiModule.parseRecipeFromSocial).toHaveBeenCalledWith(
      "https://www.instagram.com/reel/CvvEAHStYXS/",
      "Ube matcha latte: 1/8 tsp ube extract, 1 cup milk, 1 tsp matcha",
    );
    expect(handleParsed).toHaveBeenCalledWith(mockRecipe);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("triggers onRequireAuth when unauthenticated user clicks any intake pathway", async () => {
    const user = userEvent.setup();
    const handleRequireAuth = vi.fn();
    const handleSelectManual = vi.fn();

    const pathways = [
      /Manual entry/i,
      /Scan from photo/i,
      /Paste from text/i,
      /From recipe website/i,
      /From TikTok, Instagram, or YouTube/i,
    ];

    for (const pathway of pathways) {
      handleRequireAuth.mockClear();
      const { unmount } = render(
        <AddRecipeModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectManual={handleSelectManual}
          onParsedRecipe={vi.fn()}
          requireAuth={true}
          onRequireAuth={handleRequireAuth}
        />
      );

      await user.click(screen.getByRole("button", { name: pathway }));
      expect(handleRequireAuth).toHaveBeenCalledTimes(1);
      expect(handleSelectManual).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("renders the close button with outline suppression so it has no red border", () => {
    render(
      <AddRecipeModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectManual={vi.fn()}
        onParsedRecipe={vi.fn()}
      />
    );

    const closeButton = screen.getByRole("button", { name: "Close intake dialog" });
    expect(closeButton.className).toContain("focus-visible:outline-none");
    expect(closeButton.className).toContain("rounded-full");
  });

  it("renders Gemini AI badges with whitespace-nowrap and shrink-0 to prevent awkward wrapping", () => {
    const { container } = render(
      <AddRecipeModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectManual={vi.fn()}
        onParsedRecipe={vi.fn()}
      />
    );

    const badges = container.querySelectorAll(".ai-badge");
    expect(badges.length).toBe(4);
    badges.forEach((badge) => {
      expect(badge.textContent).toBe("Gemini AI");
      expect(badge.className).toContain("whitespace-nowrap");
      expect(badge.className).toContain("shrink-0");
    });
  });
});

