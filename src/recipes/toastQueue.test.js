import { describe, expect, it } from "vitest";
import { appendToast } from "./toastQueue";

describe("appendToast", () => {
  it("suppresses an exact duplicate created within the defensive window", () => {
    const current = [
      {
        id: "toast-1",
        message: "Grocery list cleared",
        type: "success",
        title: "",
        createdAt: 1_000,
      },
    ];

    const next = appendToast(
      current,
      {
        id: "toast-2",
        message: "Grocery list cleared",
        type: "success",
        title: "",
        createdAt: 1_900,
      },
    );

    expect(next).toBe(current);
  });

  it("keeps repeated messages after the defensive window", () => {
    const current = [
      {
        id: "toast-1",
        message: "Recipe saved",
        type: "success",
        title: "",
        createdAt: 1_000,
      },
    ];

    const next = appendToast(
      current,
      {
        id: "toast-2",
        message: "Recipe saved",
        type: "success",
        title: "",
        createdAt: 2_300,
      },
    );

    expect(next).toHaveLength(2);
  });

  it("does not suppress messages with a different severity or title", () => {
    const current = [
      {
        id: "toast-1",
        message: "Sync finished",
        type: "info",
        title: "",
        createdAt: 1_000,
      },
    ];

    const next = appendToast(
      current,
      {
        id: "toast-2",
        message: "Sync finished",
        type: "error",
        title: "Sync problem",
        createdAt: 1_100,
      },
    );

    expect(next).toHaveLength(2);
  });
});

