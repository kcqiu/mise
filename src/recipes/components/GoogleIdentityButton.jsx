import { useEffect, useRef, useState } from "react";

const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

let googleScriptPromise;

function loadGoogleIdentityServices() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }

  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
    const script = existingScript || document.createElement("script");

    const handleLoad = () => {
      if (window.google?.accounts?.id) {
        resolve(window.google);
      } else {
        googleScriptPromise = undefined;
        script.remove();
        reject(new Error("Google sign-in could not be loaded."));
      }
    };
    const handleError = () => {
      googleScriptPromise = undefined;
      script.remove();
      reject(new Error("Google sign-in could not be loaded."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.id = GOOGLE_SCRIPT_ID;
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return googleScriptPromise;
}

async function createNoncePair() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const rawNonce = btoa(String.fromCharCode(...bytes));
  const encodedNonce = new TextEncoder().encode(rawNonce);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encodedNonce);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { rawNonce, hashedNonce };
}

export default function GoogleIdentityButton({
  clientId,
  onCredential,
  onError,
  disabled = false,
}) {
  const buttonRef = useRef(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;

    let active = true;
    const buttonContainer = buttonRef.current;

    const initialize = async () => {
      try {
        const [google, noncePair] = await Promise.all([
          loadGoogleIdentityServices(),
          createNoncePair(),
        ]);
        if (!active) return;

        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: "popup",
          context: "signin",
          nonce: noncePair.hashedNonce,
          use_fedcm_for_button: true,
          button_auto_select: false,
          callback: async (response) => {
            if (!response?.credential || !active) return;
            setWorking(true);
            try {
              await onCredential(response.credential, noncePair.rawNonce);
            } catch (error) {
              if (active) onError(error);
            } finally {
              if (active) setWorking(false);
            }
          },
        });

        buttonContainer.replaceChildren();
        const measuredWidth = Math.floor(
          buttonContainer.getBoundingClientRect().width,
        );
        google.accounts.id.renderButton(buttonContainer, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: "continue_with",
          logo_alignment: "left",
          width: Math.min(measuredWidth || 400, 400),
        });
      } catch (error) {
        if (active) onError(error);
      }
    };

    initialize();
    return () => {
      active = false;
      buttonContainer.replaceChildren();
    };
  }, [clientId, onCredential, onError]);

  if (!clientId) {
    return (
      <p className="m-0 text-center text-[13px] text-[#99281a]" role="status">
        Google sign-in is not configured.
      </p>
    );
  }

  return (
    <div className="relative flex min-h-11 w-full items-center justify-center">
      <div
        ref={buttonRef}
        className={disabled || working ? "pointer-events-none opacity-60" : ""}
        aria-label="Continue with Google"
      />
      {working && (
        <span className="absolute inset-0 flex items-center justify-center rounded bg-white text-sm font-medium text-[#3c4043]">
          Connecting to Google…
        </span>
      )}
    </div>
  );
}
