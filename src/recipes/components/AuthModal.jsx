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
import IconButton from "../../components/ui/IconButton";

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
  loading = false,
  errorMessage = "",
  initialIntent = "signin", // 'signin' | 'create' | 'favorite' | 'sync'
}) {
  const dialogRef = useRef(null);
  const [connecting, setConnecting] = useState(false);

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
      className="auth-modal bg-transparent border-0 w-[calc(100%-32px)] max-w-[520px] m-auto p-0 overflow-visible open:animate-auth-modal-enter text-ink"
      closedby="any"
      aria-labelledby="auth-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="auth-modal__card relative rounded-[14px] bg-white border border-line p-8 shadow-[0_24px_64px_rgba(22,38,29,0.22)]">
        <header className="auth-modal__header flex items-center justify-between mb-5">
          <div className="auth-modal__brand flex items-center gap-3">
            <span className="mise-brand font-serif text-[42px] max-[581px]:text-[38px] font-medium leading-[0.9] text-ink pb-1">
              mise<span className="text-terracotta">.</span>
            </span>
            <span className="auth-modal__badge inline-flex items-center gap-1.25 px-2.5 py-1 rounded-full bg-[#ebf2eb] text-ink text-[11px] font-semibold uppercase tracking-[0.04em]">
              <Sparkles size={12} />
              Cook&apos;s Account
            </span>
          </div>
          <IconButton
            variant="default"
            size="default"
            className="auth-modal__close rounded-full focus-visible:outline-none focus-visible:bg-ink/[0.08]"
            onClick={onClose}
            aria-label="Close sign-in dialog"
          >
            <X size={18} />
          </IconButton>
        </header>

        <div className="auth-modal__body">
          <h2 id="auth-modal-title" className="auth-modal__title font-serif font-normal text-[28px] leading-[1.2] text-ink mb-2">
            {intentTitles[initialIntent] || intentTitles.signin}
          </h2>
          <p className="auth-modal__desc text-muted text-sm leading-[1.55] mb-[22px]">
            {intentDescriptions[initialIntent] || intentDescriptions.signin}
          </p>

          <div className="auth-modal__benefits grid grid-cols-1 min-[641px]:grid-cols-2 gap-3.5 max-[641px]:gap-2.5 p-4 mb-6 rounded-[10px] bg-[#f8faf7] border border-[#e5ede3]">
            <div className="auth-benefit flex items-start gap-2.5">
              <div className="auth-benefit__icon text-ink shrink-0 mt-0.5">
                <Utensils size={16} />
              </div>
              <div>
                <strong className="block text-ink text-xs leading-[1.5] font-semibold mb-0.5">Private Cookbook</strong>
                <span className="block text-muted text-[11px] leading-[1.35]">Create, edit, and keep original recipes safe.</span>
              </div>
            </div>
            <div className="auth-benefit flex items-start gap-2.5">
              <div className="auth-benefit__icon text-ink shrink-0 mt-0.5">
                <Cloud size={16} />
              </div>
              <div>
                <strong className="block text-ink text-xs leading-[1.5] font-semibold mb-0.5">Cross-Device Sync</strong>
                <span className="block text-muted text-[11px] leading-[1.35]">Your shelf is always in sync between phone &amp; desktop.</span>
              </div>
            </div>
            <div className="auth-benefit flex items-start gap-2.5">
              <div className="auth-benefit__icon text-ink shrink-0 mt-0.5">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <strong className="block text-ink text-xs leading-[1.5] font-semibold mb-0.5">Cooking Progress</strong>
                <span className="block text-muted text-[11px] leading-[1.35]">Active checklist states saved as you prep and cook.</span>
              </div>
            </div>
            <div className="auth-benefit flex items-start gap-2.5">
              <div className="auth-benefit__icon text-ink shrink-0 mt-0.5">
                <Bookmark size={16} />
              </div>
              <div>
                <strong className="block text-ink text-xs leading-[1.5] font-semibold mb-0.5">Quick Favorites</strong>
                <span className="block text-muted text-[11px] leading-[1.35]">Curate your go-to weekday staples in one tap.</span>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="auth-modal__error flex items-start gap-2.5 p-3.5 mb-5 rounded-lg bg-[#fdf2f0] border border-[#f7ceca] text-[#99281a] text-[13px] leading-[1.45]" role="alert">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong className="block uppercase tracking-[0.03em] text-xs mb-0.5">Authentication Notice</strong>
                <p className="m-0">{errorMessage}</p>
              </div>
            </div>
          )}

          <div className="auth-modal__actions flex flex-col gap-2.5">
            <button
              type="button"
              className="google-sign-in-button w-full min-h-[48px] p-0 rounded-lg border border-[#dadce0] bg-white text-[#3c4043] text-[15px] font-[550] flex items-center justify-center gap-3 shadow-[0_1px_3px_rgba(60,64,67,0.08)] hover:bg-[#f8f9fa] hover:border-[#c6c9ce] hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(60,64,67,0.16)] active:translate-y-0 focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
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

            <button
              type="button"
              className="auth-modal__guest-button w-full min-h-[38px] text-muted text-[13px] underline underline-offset-[3px] bg-transparent border-0 cursor-pointer hover:text-ink transition-colors"
              onClick={onClose}
            >
              Continue browsing as guest
            </button>
          </div>

          <div className="auth-modal__footer border-t border-line text-muted text-center mt-[18px] pt-3.5 text-[11px]">
            <div className="auth-modal__lock inline-flex items-center gap-1.5">
              <Lock size={12} />
              <span>Private Access: Only approved Google accounts can sync.</span>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
