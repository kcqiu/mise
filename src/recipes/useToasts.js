import { useCallback, useState } from "react";
import { appendToast } from "./toastQueue";

export default function useToasts(initialError) {
  const [toasts, setToasts] = useState(() =>
    initialError
      ? [{ id: "init", message: initialError, type: "error" }]
      : [],
  );

  const addToast = useCallback((message, type = "info", title = "") => {
    if (!message) return;
    const createdAt = Date.now();
    setToasts((prev) =>
      appendToast(prev, {
        id: `toast-${createdAt}-${Math.random().toString(36).slice(2, 6)}`,
        message,
        type,
        title,
        createdAt,
      }),
    );
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
