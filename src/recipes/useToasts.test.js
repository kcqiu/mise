import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import useToasts from "./useToasts";

describe("useToasts hook", () => {
  it("initializes with an empty toast list", () => {
    const { result } = renderHook(() => useToasts());
    expect(result.current.toasts).toEqual([]);
  });

  it("appends and dismisses toasts correctly", () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.addToast("Recipe saved!", "success", "Saved");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Recipe saved!");
    expect(result.current.toasts[0].type).toBe("success");
    expect(result.current.toasts[0].title).toBe("Saved");

    const toastId = result.current.toasts[0].id;
    act(() => {
      result.current.dismissToast(toastId);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it("ignores empty messages", () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.addToast("");
      result.current.addToast(null);
      result.current.addToast(undefined);
    });

    expect(result.current.toasts).toHaveLength(0);
  });
});
