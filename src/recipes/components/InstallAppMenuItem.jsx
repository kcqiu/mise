import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";

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

function isIosSafari() {
  if (!isIosDevice()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export default function InstallAppMenuItem() {
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

  if (installed || (!ios && !installPrompt)) return null;

  const handleInstall = async () => {
    if (ios) {
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

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className="flex w-full min-h-10 items-center gap-2.5 rounded-md border-0 bg-transparent px-2 text-left text-[13px] font-medium text-ink transition-colors hover:bg-paper cursor-pointer"
      >
        <Download size={17} aria-hidden="true" />
        {buttonLabel}
      </button>

      {showIosGuide && (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center bg-ink/35 p-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowIosGuide(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mise-install-title"
            className="w-full max-w-[390px] rounded-[18px] border border-line bg-[#fffdf8] p-5 shadow-[0_24px_70px_rgba(36,35,31,0.24)]"
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
                  Add MISE to Home Screen
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close install instructions"
                onClick={() => setShowIosGuide(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-paper text-ink cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {!isIosSafari() && (
              <p className="mt-4 mb-0 text-sm leading-relaxed text-muted">
                Open this page in Safari first, then follow these steps.
              </p>
            )}

            <ol className="mt-5 mb-0 grid list-none gap-3 p-0">
              <li className="flex items-center gap-3 border-t border-line pt-3 text-sm text-ink">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ebf2eb] text-[#38533e]">
                  <Share size={17} />
                </span>
                <span>Tap the Share button in Safari.</span>
              </li>
              <li className="flex items-center gap-3 border-t border-line pt-3 text-sm text-ink">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ebf2eb] text-[#38533e]">
                  <SquarePlus size={17} />
                </span>
                <span>Choose Add to Home Screen, then tap Add.</span>
              </li>
            </ol>
          </section>
        </div>
      )}
    </>
  );
}
