import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPolicy from "./PrivacyPolicy";

describe("PrivacyPolicy", () => {
  it("explains Google sign-in data and gives users a way back to MISE", () => {
    render(<PrivacyPolicy />);

    expect(
      screen.getByRole("heading", { name: "Privacy policy." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Google sign-in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your choices" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the shelf" })).toHaveAttribute(
      "href",
      "/#/",
    );
  });
});
