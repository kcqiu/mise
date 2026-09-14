import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Cloud, Info, X } from "lucide-react";

export default function ToastStack({ toasts, onDismiss }) {
  useEffect(() => {
    if (!toasts.length) return;

    // Set auto-dismiss timers for each toast
    const timers = toasts.map((toast) => {
      const duration = toast.type === "error" ? 6500 : 4500;
      return setTimeout(() => {
        onDismiss(toast.id);
      }, duration);
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [toasts, onDismiss]);

  if (!toasts.length) return null;

  return (
    <aside
      className="toast-stack"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.type === "error"
            ? AlertCircle
            : toast.type === "success"
              ? CheckCircle2
              : toast.type === "cloud"
                ? Cloud
                : Info;

        return (
          <div
            key={toast.id}
            className={`toast-item toast-item--${toast.type || "info"}`}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <div className="toast-item__icon">
              <Icon size={18} />
            </div>
            <div className="toast-item__content">
              {toast.title && (
                <strong className="toast-item__title">{toast.title}</strong>
              )}
              <span className="toast-item__message">{toast.message}</span>
            </div>
            <button
              className="icon-button toast-item__dismiss"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
