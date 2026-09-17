import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useKeepAwake from "./useKeepAwake";

describe("useKeepAwake hook", () => {
  let originalWakeLock;
  let mockLock;

  beforeEach(() => {
    originalWakeLock = navigator.wakeLock;
    mockLock = {
      released: false,
      release: vi.fn(async function () {
        mockLock.released = true;
        if (this._onrelease) this._onrelease();
      }),
      addEventListener: vi.fn((event, callback) => {
        if (event === "release") {
          mockLock._onrelease = callback;
        }
      }),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    if (originalWakeLock !== undefined) {
      Object.defineProperty(navigator, "wakeLock", {
        value: originalWakeLock,
        configurable: true,
        writable: true,
      });
    } else {
      delete navigator.wakeLock;
    }
    vi.restoreAllMocks();
  });

  it("reports supported: false when wakeLock is not in navigator", () => {
    delete navigator.wakeLock;
    const { result } = renderHook(() => useKeepAwake());
    expect(result.current.supported).toBe(false);
    expect(result.current.enabled).toBe(false);
  });

  it("reports supported: true when wakeLock is present in navigator", () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn() },
      configurable: true,
      writable: true,
    });
    const { result } = renderHook(() => useKeepAwake());
    expect(result.current.supported).toBe(true);
  });

  it("activates wake lock when toggled on", async () => {
    const requestMock = vi.fn().mockResolvedValue(mockLock);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useKeepAwake());

    await act(async () => {
      await result.current.toggle();
    });

    expect(requestMock).toHaveBeenCalledWith("screen");
    expect(result.current.enabled).toBe(true);
    expect(result.current.error).toBe("");
  });

  it("releases wake lock when toggled off", async () => {
    const requestMock = vi.fn().mockResolvedValue(mockLock);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useKeepAwake());

    // Toggle on
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.enabled).toBe(true);

    // Toggle off
    await act(async () => {
      await result.current.toggle();
    });
    expect(mockLock.release).toHaveBeenCalled();
    expect(result.current.enabled).toBe(false);
  });

  it("sets error message when wakeLock request fails", async () => {
    const requestMock = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useKeepAwake());

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toMatch(/couldn't keep the screen awake/i);
  });

  it("re-acquires wake lock when document becomes visible", async () => {
    const requestMock = vi.fn().mockResolvedValue(mockLock);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useKeepAwake());

    await act(async () => {
      await result.current.toggle();
    });
    expect(requestMock).toHaveBeenCalledTimes(1);

    // Simulate lock release on screen sleep / tab background
    if (mockLock._onrelease) {
      mockLock._onrelease();
    }

    // Simulate returning to visible tab
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it("releases wake lock on unmount", async () => {
    const requestMock = vi.fn().mockResolvedValue(mockLock);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const { result, unmount } = renderHook(() => useKeepAwake());

    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.enabled).toBe(true);

    unmount();
    expect(mockLock.release).toHaveBeenCalled();
  });
});
