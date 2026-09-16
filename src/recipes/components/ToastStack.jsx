import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Cloud, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ToastStack({ toasts, onDismiss }) {
  useEffect(() => {
    if (!toasts.length) return;

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
      className="toast-stack fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 right-auto -translate-x-1/2 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 z-[1000] flex w-[calc(100%-2rem)] max-w-[420px] flex-col gap-2.5 pointer-events-none sm:w-auto sm:min-w-[320px]"
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

        const borderStyle =
          toast.type === "error"
            ? "border-l-4 border-l-terracotta border-[#f7d2cd]"
            : toast.type === "success"
              ? "border-l-4 border-l-[#287a43] border-[#c9e4d0]"
              : toast.type === "cloud"
                ? "border-l-4 border-l-[#1a73e8] border-[#d4e4f7]"
                : "border-l-4 border-l-green border-[#dce4dd]";

        const iconColor =
          toast.type === "error"
            ? "text-terracotta"
            : toast.type === "success"
              ? "text-[#287a43]"
              : toast.type === "cloud"
                ? "text-[#1a73e8]"
                : "text-green";

        return (
          <div
            key={toast.id}
            className={cn(
              "toast-item pointer-events-auto text-ink bg-white rounded-[9px] flex items-center gap-3 px-4 py-3 text-[13px] leading-[1.45] shadow-[0_12px_36px_rgba(18,30,24,0.14)] transition-all",
              borderStyle
            )}
            role={toast.type === "error" ? "alert" : "status"}
          >
            <div className={cn("toast-item__icon shrink-0 flex items-center", iconColor)}>
              <Icon size={18} />
            </div>
            <div className="toast-item__content flex-1 min-w-0">
              {toast.title && (
                <strong className="toast-item__title text-[11px] font-bold uppercase tracking-[0.04em] mb-0.5 block">
                  {toast.title}
                </strong>
              )}
              <span className="toast-item__message text-[13px] leading-[1.4] block break-words">
                {toast.message}
              </span>
            </div>
            <button
              type="button"
              className="toast-item__dismiss shrink-0 w-7 h-7 rounded flex items-center justify-center p-0 text-muted hover:text-ink hover:bg-black/5 transition-colors cursor-pointer border-0 bg-transparent"
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
