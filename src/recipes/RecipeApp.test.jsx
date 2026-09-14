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
});
