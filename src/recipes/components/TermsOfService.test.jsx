import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TermsOfService from "./TermsOfService";

describe("TermsOfService", () => {
  it("sets expectations for using MISE and links back to the shelf", () => {
    render(<TermsOfService />);

    expect(
      screen.getByRole("heading", { name: "Terms of service." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your recipes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "AI-assisted tools" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the shelf" })).toHaveAttribute(
      "href",
      "/#/",
    );
  });
});
