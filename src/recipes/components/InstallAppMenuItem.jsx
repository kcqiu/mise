import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Share, X } from "lucide-react";

let deferredInstallPrompt = null;
const installPromptSubscribers = new Set();

function publishInstallPrompt(prompt) {
  deferredInstallPrompt = prompt;
  installPromptSubscribers.forEach((subscriber) => subscriber(prompt));
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    publishInstallPrompt(event);
  });
  window.addEventListener("appinstalled", () => publishInstallPrompt(null));
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

function getIosBrowserName() {
  if (!isIosDevice()) return "your browser";
  if (/CriOS/i.test(navigator.userAgent)) return "Chrome";
  if (/FxiOS/i.test(navigator.userAgent)) return "Firefox";
  if (/EdgiOS/i.test(navigator.userAgent)) return "Edge";
  if (/OPiOS/i.test(navigator.userAgent)) return "Opera";
  if (/Safari/i.test(navigator.userAgent)) return "Safari";
  return "your browser";
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export default function InstallAppMenuItem() {
  const buttonRef = useRef(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const [installPrompt, setInstallPrompt] = useState(deferredInstallPrompt);
  const [installed, setInstalled] = useState(isStandalone);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const ios = isIosDevice();

  useEffect(() => {
    const handlePrompt = (prompt) => {
      setInstallPrompt(prompt);
    };
    const handleInstalled = () => setInstalled(true);

    installPromptSubscribers.add(handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      installPromptSubscribers.delete(handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const closeGuide = useCallback(() => setShowIosGuide(false), []);

  useEffect(() => {
    if (!showIosGuide) return undefined;

    const dialog = dialogRef.current;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeGuide();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll("button"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [closeGuide, showIosGuide]);

  if (installed || (!ios && !installPrompt)) return null;

  const handleInstall = async () => {
    if (ios) {
      const accountMenu = buttonRef.current?.closest("details");
      returnFocusRef.current =
        accountMenu?.querySelector("summary") || buttonRef.current;
      accountMenu?.removeAttribute("open");
      setShowIosGuide(true);
      return;
    }

    const prompt = installPrompt;
    if (!prompt) return;

    try {
      await prompt.prompt();
      await prompt.userChoice;
    } finally {
      publishInstallPrompt(null);
    }
  };

  const buttonLabel = ios ? "Add MISE to Home Screen" : "Install MISE";
  const browserName = getIosBrowserName();

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleInstall}
        className="flex w-full min-h-10 items-center gap-2.5 rounded-md border-0 bg-transparent px-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-paper cursor-pointer"
      >
        <Download size={17} aria-hidden="true" />
        {buttonLabel}
      </button>

      {showIosGuide && createPortal(
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center bg-ink/45 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeGuide();
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mise-install-title"
            className="w-full max-w-[380px] rounded-[16px] border border-line bg-white p-6 shadow-[0_24px_64px_rgba(22,38,29,0.22)]"
          >
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#667361]">
                  Keep your cookbook close
                </p>
                <h2
                  id="mise-install-title"
                  className="m-0 font-serif text-[28px] font-medium leading-tight text-ink"
                >
                  Add MISE to your Home Screen
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close install instructions"
                ref={closeButtonRef}
                onClick={closeGuide}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-ink transition-colors hover:bg-ink/[0.06] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mt-4 mb-0 text-sm leading-relaxed text-muted">
              Keep your recipe shelf one tap away. Use {browserName}&apos;s
              sharing menu to add it like an app.
            </p>

            <ol className="mt-5 mb-0 grid list-none gap-0 border-y border-line p-0">
              <li className="flex items-center gap-3 py-3.5 text-sm leading-relaxed text-ink">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ebf2eb] text-[12px] font-semibold text-[#38533e]">
                  1
                </span>
                <span className="flex items-center gap-1.5">
                  In {browserName}, tap Share <Share size={15} aria-hidden="true" />.
                </span>
              </li>
              <li className="flex items-center gap-3 border-t border-line py-3.5 text-sm leading-relaxed text-ink">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ebf2eb] text-[12px] font-semibold text-[#38533e]">
                  2
                </span>
                <span>Choose <strong>Add to Home Screen</strong>.</span>
              </li>
              <li className="flex items-center gap-3 border-t border-line py-3.5 text-sm leading-relaxed text-ink">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ebf2eb] text-[12px] font-semibold text-[#38533e]">
                  3
                </span>
                <span>Confirm by tapping <strong>Add</strong>.</span>
              </li>
            </ol>

            <button
              type="button"
              onClick={closeGuide}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-ink bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-[#383630] cursor-pointer"
            >
              Got it
            </button>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
