import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  Cloud,
  Loader2,
  Lock,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { GOOGLE_CLIENT_ID } from "../cloud";

/**
 * Google "G" brand icon SVG (official branding guidelines)
 */
function GoogleIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export default function AuthModal({
  isOpen,
  onClose,
  onSignIn,
  onSignInWithIdToken,
  loading = false,
  errorMessage = "",
  initialIntent = "signin", // 'signin' | 'create' | 'favorite' | 'sync'
}) {
  const dialogRef = useRef(null);
  const gisContainerRef = useRef(null);
  const [connecting, setConnecting] = useState(false);
  const [gisReady, setGisReady] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }

      // Light-dismiss fallback for browsers without native closedby support
      const handleBackdropClick = (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const inside =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!inside) {
          onClose();
        }
      };

      if (!("closedBy" in HTMLDialogElement.prototype)) {
        dialog.addEventListener("click", handleBackdropClick);
        return () => dialog.removeEventListener("click", handleBackdropClick);
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
      setConnecting(false);
    }
  }, [isOpen, onClose]);

  // Initialize Google Identity Services (GIS)
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const initGsi = () => {
      if (typeof window === "undefined" || !window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            if (!response?.credential) return;
            setConnecting(true);
            try {
              if (onSignInWithIdToken) {
                await onSignInWithIdToken(response.credential);
              }
            } catch {
              if (mounted) setConnecting(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (gisContainerRef.current) {
          gisContainerRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(gisContainerRef.current, {
            theme: "outline",
            size: "large",
            type: "standard",
            text: "continue_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: 320,
          });
          if (mounted) setGisReady(true);
        }
      } catch {
        if (mounted) setGisReady(false);
      }
    };

    initGsi();
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        initGsi();
        clearInterval(interval);
      }
    }, 250);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isOpen, onSignInWithIdToken]);

  const handleSignIn = async () => {
    setConnecting(true);
    try {
      await onSignIn();
    } catch {
      setConnecting(false);
    }
  };

  if (!isOpen) return null;

  const intentTitles = {
    signin: "Welcome to your kitchen shelf",
    create: "Sign in to write your own recipes",
    favorite: "Sign in to sync your favorites",
    sync: "Sign in to sync cooking progress",
    groceries: "Sign in to keep your grocery list",
  };

  const intentDescriptions = {
    signin:
      "A personal cookbook space where recipes stay organized, favorites are remembered, and cooking progress is kept across all your devices.",
    create:
      "Original family favorites and experimental recipes belong on your shelf. Connect with Google to start authoring.",
    favorite:
      "Keep your favorite keepers ready to cook whether you're at your computer or in the kitchen on your phone.",
    sync:
      "Never lose your place. Connect your account to automatically sync step checklists and ingredient preps.",
    groceries:
      "Keep your shopping list synced across your phone, tablet, and computer so you never forget an ingredient at the store.",
  };

  return (
    <dialog
      ref={dialogRef}
      className="auth-modal"
      closedby="any"
      aria-labelledby="auth-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="auth-modal__card">
        <header className="auth-modal__header">
          <div className="auth-modal__brand">
            <span className="mise-brand">
              mise<span>.</span>
            </span>
            <span className="auth-modal__badge">
              <Sparkles size={12} />
              Cook's Account
            </span>
          </div>
          <button
            className="icon-button auth-modal__close"
            onClick={onClose}
            aria-label="Close sign-in dialog"
          >
            <X size={18} />
          </button>
        </header>

        <div className="auth-modal__body">
          <h2 id="auth-modal-title" className="auth-modal__title">
            {intentTitles[initialIntent] || intentTitles.signin}
          </h2>
          <p className="auth-modal__desc">
            {intentDescriptions[initialIntent] || intentDescriptions.signin}
          </p>

          <div className="auth-modal__benefits">
            <div className="auth-benefit">
              <div className="auth-benefit__icon">
                <Utensils size={16} />
              </div>
              <div>
                <strong>Private Cookbook</strong>
                <span>Create, edit, and keep original recipes safe.</span>
              </div>
            </div>
            <div className="auth-benefit">
              <div className="auth-benefit__icon">
                <Cloud size={16} />
              </div>
              <div>
                <strong>Cross-Device Sync</strong>
                <span>Your shelf is always in sync between phone & desktop.</span>
              </div>
            </div>
            <div className="auth-benefit">
              <div className="auth-benefit__icon">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <strong>Cooking Progress</strong>
                <span>Active checklist states saved as you prep and cook.</span>
              </div>
            </div>
            <div className="auth-benefit">
              <div className="auth-benefit__icon">
                <Bookmark size={16} />
              </div>
              <div>
                <strong>Quick Favorites</strong>
                <span>Curate your go-to weekday staples in one tap.</span>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="auth-modal__error" role="alert">
              <AlertCircle size={16} />
              <div>
                <strong>Authentication Notice</strong>
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          <div className="auth-modal__actions">
            <div
              ref={gisContainerRef}
              className={`gis-button-wrapper ${gisReady ? "is-ready" : "is-hidden"}`}
            />
            {(!gisReady || connecting || loading) && (
              <button
                className="google-sign-in-button"
                onClick={handleSignIn}
                disabled={loading || connecting}
                aria-label="Continue with Google"
              >
                {connecting || loading ? (
                  <>
                    <Loader2 size={18} className="spin-icon" />
                    <span>Connecting to Google...</span>
                  </>
                ) : (
                  <>
                    <GoogleIcon size={19} />
                    <span>Continue with Google</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              className="auth-modal__guest-button"
              onClick={onClose}
            >
              Continue browsing as guest
            </button>
          </div>

          <div className="auth-modal__footer">
            <div className="auth-modal__lock">
              <Lock size={12} />
              <span>Private Access: Only approved Google accounts can sync.</span>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
