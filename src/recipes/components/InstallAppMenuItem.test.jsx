import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import InstallAppMenuItem from "./InstallAppMenuItem";

const originalUserAgent = window.navigator.userAgent;
const originalStandalone = window.navigator.standalone;
const originalMatchMedia = window.matchMedia;

function setNavigatorValue(key, value) {
  Object.defineProperty(window.navigator, key, {
    configurable: true,
    value,
  });
}

function setBrowser({ userAgent = originalUserAgent, standalone = false } = {}) {
  setNavigatorValue("userAgent", userAgent);
  setNavigatorValue("standalone", standalone);
  window.matchMedia = vi.fn().mockReturnValue({
    matches: standalone,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

afterEach(() => {
  setNavigatorValue("userAgent", originalUserAgent);
  setNavigatorValue("standalone", originalStandalone);
  window.matchMedia = originalMatchMedia;
});

describe("InstallAppMenuItem", () => {
  it("opens Add to Home Screen instructions on iPhone Safari", async () => {
    setBrowser({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    const user = userEvent.setup();

    render(<InstallAppMenuItem />);

    await user.click(
      screen.getByRole("button", { name: "Add MISE to Home Screen" }),
    );

    expect(
      screen.getByRole("dialog", { name: "Add MISE to your iPhone" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Safari, tap Share/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });

  it("shows Chrome instructions in a focused dialog and closes the account menu", async () => {
    setBrowser({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1",
    });
    const user = userEvent.setup();

    render(
      <details open>
        <summary>Account</summary>
        <InstallAppMenuItem />
      </details>,
    );

    await user.click(
      screen.getByRole("button", { name: "Add MISE to Home Screen" }),
    );

    expect(screen.getByText("Add MISE to your iPhone")).toBeInTheDocument();
    expect(screen.getByText(/Chrome.*Share/i)).toBeInTheDocument();
    expect(screen.queryByText(/Open this page in Safari/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    expect(screen.getByText("Account").closest("details")).not.toHaveAttribute(
      "open",
    );
  });

  it("uses the browser install prompt when it becomes available", async () => {
    setBrowser();
    const prompt = vi.fn().mockResolvedValue(undefined);

    render(<InstallAppMenuItem />);

    expect(
      screen.queryByRole("button", { name: "Install MISE" }),
    ).not.toBeInTheDocument();

    const event = new Event("beforeinstallprompt");
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    fireEvent(window, event);

    const installButton = await screen.findByRole("button", {
      name: "Install MISE",
    });
    await userEvent.click(installButton);

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("button", { name: "Install MISE" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer installation when MISE is already standalone", () => {
    setBrowser({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      standalone: true,
    });

    render(<InstallAppMenuItem />);

    expect(
      screen.queryByRole("button", { name: /MISE.*Home Screen|Install MISE/i }),
    ).not.toBeInTheDocument();
  });
});
