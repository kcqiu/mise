import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootPage from "./RootPage";

describe("RootPage", () => {
  it("serves the privacy policy at the public privacy path", () => {
    render(<RootPage pathname="/privacy" />);

    expect(
      screen.getByRole("heading", { name: "Privacy policy." }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Privacy policy | mise.");
  });

  it("serves the terms at the public terms path", () => {
    render(<RootPage pathname="/terms" />);

    expect(
      screen.getByRole("heading", { name: "Terms of service." }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Terms of service | mise.");
  });
});
