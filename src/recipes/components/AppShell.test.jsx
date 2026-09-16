import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppFooter, AppHeader } from "./AppShell";

describe("AppHeader", () => {
  it("attaches the grocery count to the bag icon", () => {
    render(
      <AppHeader
        account={{ session: null }}
        accountMenuRef={{ current: null }}
        cloudAvailable={false}
        favoriteCount={0}
        groceryRecipeCount={1}
        importInputRef={{ current: null }}
        onAddRecipe={vi.fn()}
        onImportRecipeFile={vi.fn()}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
        personalRecipeCount={0}
        route="library"
      />,
    );

    const groceryLink = screen.getByRole("link", {
      name: "Grocery list (1 recipes)",
    });
    const icon = groceryLink.querySelector(".groceries-nav-icon");

    expect(icon).not.toBeNull();
    expect(icon.querySelector(".groceries-badge")).toHaveTextContent("1");
  });

  it("offers an available PWA install from the signed-in account menu", async () => {
    const installEvent = new Event("beforeinstallprompt");
    installEvent.prompt = vi.fn().mockResolvedValue(undefined);
    installEvent.userChoice = Promise.resolve({ outcome: "accepted" });
    fireEvent(window, installEvent);

    render(
      <AppHeader
        account={{
          loading: false,
          session: {
            user: {
              email: "cook@example.com",
              user_metadata: { name: "Cook" },
            },
          },
        }}
        accountMenuRef={{ current: null }}
        cloudAvailable
        favoriteCount={2}
        groceryRecipeCount={0}
        importInputRef={{ current: null }}
        onAddRecipe={vi.fn()}
        onImportRecipeFile={vi.fn()}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
        personalRecipeCount={3}
        route="library"
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Install MISE" }),
    ).toBeInTheDocument();

    fireEvent(window, new Event("appinstalled"));
  });
});

describe("AppFooter", () => {
  it("gives users a public route to the privacy policy", () => {
    render(<AppFooter />);

    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });
});
