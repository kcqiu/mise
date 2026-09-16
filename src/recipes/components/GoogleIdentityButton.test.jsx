import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import GoogleIdentityButton from "./GoogleIdentityButton";

afterEach(() => {
  cleanup();
  delete window.google;
  document.getElementById("google-identity-services")?.remove();
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

  it("replaces a failed Google script so sign-in can retry", async () => {
    const firstError = vi.fn();
    const firstRender = render(
      <GoogleIdentityButton
        clientId="mise-client.apps.googleusercontent.com"
        onCredential={vi.fn()}
        onError={firstError}
      />,
    );

    const failedScript = document.getElementById("google-identity-services");
    expect(failedScript).not.toBeNull();
    failedScript.dispatchEvent(new Event("error"));

    await waitFor(() => expect(firstError).toHaveBeenCalledTimes(1));
    firstRender.unmount();

    render(
      <GoogleIdentityButton
        clientId="mise-client.apps.googleusercontent.com"
        onCredential={vi.fn()}
        onError={vi.fn()}
      />,
    );

    await waitFor(() => {
      const retryScript = document.getElementById("google-identity-services");
      expect(retryScript).not.toBeNull();
      expect(retryScript).not.toBe(failedScript);
    });
  });
});
