import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootPage from "./RootPage";

describe("RootPage", () => {
  it("serves the privacy policy at the public privacy path", () => {
    render(<RootPage pathname="/privacy" />);

    expect(
      screen.getByRole("heading", { name: "Privacy policy." }),
    ).toBeInTheDocument();
  });
});
