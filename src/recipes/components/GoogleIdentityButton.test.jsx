import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import GoogleIdentityButton from "./GoogleIdentityButton";

afterEach(() => {
  cleanup();
  delete window.google;
});

describe("GoogleIdentityButton", () => {
  it("passes Google's credential and the matching raw nonce to the app", async () => {
    let googleCallback;
    window.google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => {
            googleCallback = options.callback;
          }),
          renderButton: vi.fn((container) => {
            const button = document.createElement("button");
            button.textContent = "Continue with Google";
            container.appendChild(button);
          }),
        },
      },
    };
    const onCredential = vi.fn().mockResolvedValue(undefined);

    render(
      <GoogleIdentityButton
        clientId="mise-client.apps.googleusercontent.com"
        onCredential={onCredential}
        onError={vi.fn()}
      />,
    );

    await screen.findByRole("button", { name: "Continue with Google" });
    await googleCallback({ credential: "google-id-token" });

    await waitFor(() => {
      expect(onCredential).toHaveBeenCalledTimes(1);
    });
    expect(onCredential.mock.calls[0][0]).toBe("google-id-token");
    expect(onCredential.mock.calls[0][1]).toEqual(expect.any(String));
    expect(onCredential.mock.calls[0][1].length).toBeGreaterThan(20);
  });

  it("reports missing browser configuration without attempting Google sign-in", async () => {
    const onError = vi.fn();

    render(
      <GoogleIdentityButton
        clientId=""
        onCredential={vi.fn()}
        onError={onError}
      />,
    );

    expect(
      screen.getByText("Google sign-in is not configured."),
    ).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
