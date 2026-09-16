import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloudMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  watchSession: vi.fn(() => () => {}),
  loadAccountLibrary: vi.fn(),
  loadAccountGrocerySession: vi.fn(),
}));

vi.mock("./cloud", async () => {
  const actual = await vi.importActual("./cloud");
  return {
    ...actual,
    cloudEnabled: true,
    getSession: cloudMocks.getSession,
    watchSession: cloudMocks.watchSession,
    loadAccountLibrary: cloudMocks.loadAccountLibrary,
    loadAccountGrocerySession: cloudMocks.loadAccountGrocerySession,
  };
});

import RecipeApp from "./RecipeApp";

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/recipe/#/groceries");
  window.scrollTo = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  cloudMocks.getSession.mockReset();
  cloudMocks.watchSession.mockClear();
  cloudMocks.loadAccountLibrary.mockReset();
  cloudMocks.loadAccountGrocerySession.mockReset();
  cloudMocks.loadAccountLibrary.mockResolvedValue({
    recipes: [],
    favorites: [],
    progress: {},
  });
  cloudMocks.loadAccountGrocerySession.mockResolvedValue({ session: null });
});

afterEach(cleanup);

describe("grocery auth prompt account state", () => {
  it("does not prompt a signed-in grocery user", async () => {
    window.localStorage.setItem(
      "mise-groceries-auth-prompt-seen-v1",
      "true",
    );
    cloudMocks.getSession.mockResolvedValue({ user: { id: "account-1" } });

    render(<RecipeApp />);

    await waitFor(() => {
      expect(cloudMocks.loadAccountLibrary).toHaveBeenCalledWith("account-1");
    });
    expect(
      screen.queryByRole("heading", {
        name: "Sign in to keep your grocery list",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not prompt while account restoration is still loading", async () => {
    window.localStorage.setItem(
      "mise-groceries-auth-prompt-seen-v1",
      "true",
    );
    cloudMocks.getSession.mockReturnValue(new Promise(() => {}));

    render(<RecipeApp />);
    await act(async () => {});

    expect(
      screen.queryByRole("heading", {
        name: "Sign in to keep your grocery list",
      }),
    ).not.toBeInTheDocument();
  });
});
