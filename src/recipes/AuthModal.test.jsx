import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthModal from "./components/AuthModal";
import ToastStack from "./components/ToastStack";
import { extractAuthErrorFromUrl } from "./cloud";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

describe("AuthModal component", () => {
  it("renders when open and displays title and benefits", () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSignIn={vi.fn()}
        initialIntent="signin"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Welcome to your kitchen shelf" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue with Google/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Private Cookbook")).toBeInTheDocument();
    expect(screen.getByText("Cross-Device Sync")).toBeInTheDocument();
    expect(screen.getByText("Cooking Progress")).toBeInTheDocument();
  });

  it("calls onSignIn when Google button is clicked", async () => {
    const user = userEvent.setup();
    const handleSignIn = vi.fn().mockResolvedValue();

    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSignIn={handleSignIn}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Continue with Google/i }),
    );
    expect(handleSignIn).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <AuthModal
        isOpen={true}
        onClose={handleClose}
        onSignIn={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Close sign-in dialog/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("displays error message if provided", () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSignIn={vi.fn()}
        errorMessage="This account is not approved for MISE."
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText("This account is not approved for MISE."),
    ).toBeInTheDocument();
  });

  it("renders with favorite intent copy when initialIntent is favorite", () => {
    render(
      <AuthModal
        isOpen={true}
        onClose={vi.fn()}
        onSignIn={vi.fn()}
        initialIntent="favorite"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Sign in to sync your favorites" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Keep your favorite keepers ready to cook whether you're at your computer or in the kitchen on your phone.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ToastStack component", () => {
  it("renders toasts and fires onDismiss when close clicked", async () => {
    const user = userEvent.setup();
    const handleDismiss = vi.fn();
    const toasts = [
      { id: "1", message: "Recipe saved to account.", type: "success", title: "Saved" },
      { id: "2", message: "Error syncing changes.", type: "error" },
    ];

    render(<ToastStack toasts={toasts} onDismiss={handleDismiss} />);

    expect(screen.getByText("Recipe saved to account.")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Error syncing changes.")).toBeInTheDocument();

    const closeButtons = screen.getAllByRole("button", {
      name: /Dismiss notification/i,
    });
    expect(closeButtons).toHaveLength(2);
    await user.click(closeButtons[0]);
    expect(handleDismiss).toHaveBeenCalledWith("1");
  });
});

describe("extractAuthErrorFromUrl helper", () => {
  it("extracts error description from hash and cleans history", () => {
    window.history.replaceState(
      null,
      "",
      "/#error=access_denied&error_code=403&error_description=This+account+is+not+approved+for+MISE.",
    );

    const error = extractAuthErrorFromUrl();
    expect(error).toBe("This account is not approved for MISE.");
    expect(window.location.hash).toBe("#/");
  });
});
