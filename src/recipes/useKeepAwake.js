import { useEffect, useRef, useState } from "react";

export default function useKeepAwake() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const lockRef = useRef(null);

  const requestLock = async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return false;
    }
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return false;
    }
    try {
      if (lockRef.current && !lockRef.current.released) {
        return true;
      }
      const lock = await navigator.wakeLock.request("screen");
      lockRef.current = lock;
      lock.addEventListener("release", () => {
        lockRef.current = null;
      });
      return true;
    } catch (err) {
      console.warn("WakeLock request failed:", err);
      return false;
    }
  };

  const releaseLock = async () => {
    if (lockRef.current) {
      try {
        await lockRef.current.release();
      } catch {
        // Ignore release errors
      }
      lockRef.current = null;
    }
  };

  const toggle = async () => {
    setError("");
    if (enabled) {
      await releaseLock();
      setEnabled(false);
    } else {
      // Must be requested directly within user gesture for mobile browser security (e.g. Safari iOS)
      const success = await requestLock();
      if (success) {
        setEnabled(true);
      } else {
        setEnabled(false);
        setError(
          "Your device couldn't keep the screen awake. Check its auto-lock setting instead."
        );
      }
    }
  };

  // Re-acquire lock when page becomes visible again, if user had enabled it
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && enabled) {
        await requestLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled]);

  // Clean up lock when component unmounts
  useEffect(() => {
    return () => {
      releaseLock();
    };
  }, []);

  return {
    supported: typeof navigator !== "undefined" && "wakeLock" in navigator,
    enabled,
    toggle,
    error,
  };
}
