import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Loader2, Share2, X } from "lucide-react";
import { TextButton } from "@/components/ui/TextButton";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import { getOrCreateRecipeShare } from "../cloud";

export function getShareUrl(recipeId, shareToken = null, _isSystem = false) {
  const base =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${window.location.pathname}`;
  if (shareToken) {
    return `${base}#/shared/${shareToken}`;
  }
  return `${base}#/recipe/${recipeId}`;
}

export function copyTextFallback(text) {
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.setAttribute("readonly", "");
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const success = Boolean(document.execCommand("copy"));
    document.body.removeChild(textarea);
    return success;
  } catch {
    document.body.removeChild(textarea);
    return false;
  }
}

export default function ShareRecipeButton({
  recipe,
  onToast,
  className,
  isLocal = false,
  isCloud = false,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState(recipe?.shareToken || null);
  const [loadingToken, setLoadingToken] = useState(false);
  const copyBtnRef = useRef(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!modalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalOpen]);

  // Fetch or generate share token when modal opens for a cloud recipe
  useEffect(() => {
    if (!modalOpen || !recipe) return;
    if (recipe.shareToken) {
      setShareToken(recipe.shareToken);
      return;
    }
    // If user owns the recipe in cloud, retrieve or create capability token
    if (isCloud && isLocal && !recipe.isSystem && !recipe.example) {
      let active = true;
      setLoadingToken(true);
      getOrCreateRecipeShare(recipe.id)
        .then((token) => {
          if (active) {
            if (token) setShareToken(token);
            setLoadingToken(false);
          }
        })
        .catch(() => {
          if (active) setLoadingToken(false);
        });
      return () => {
        active = false;
      };
    }
  }, [modalOpen, recipe, isCloud, isLocal]);

  if (!recipe) return null;

  const isSystem = Boolean(recipe.isSystem || recipe.example);
  const shareUrl = getShareUrl(recipe.id, shareToken, isSystem);

  const handleCopyLink = async () => {
    if (loadingToken) return;
    let success;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        success = true;
      } else {
        success = copyTextFallback(shareUrl);
      }
    } catch {
      success = copyTextFallback(shareUrl);
    }

    if (success) {
      setCopied(true);
      onToast?.("Recipe link copied to clipboard", "info");
    } else {
      onToast?.("Failed to copy link to clipboard", "error");
    }
  };

  const handleNativeShare = async () => {
    if (loadingToken) return;
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return handleCopyLink();
    }

    // Do NOT pass title to navigator.share because on mobile (especially iOS Safari),
    // the system share sheet's "Copy" action copies the title string instead of the URL.
    // By providing url (and url as text), tapping "Copy" in the share sheet copies the link.
    const shareData = {
      url: shareUrl,
      text: shareUrl,
    };

    try {
      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.share({ url: shareUrl });
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        await handleCopyLink();
      }
    }
  };

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      <TextButton
        className={cn(
          "text-muted hover:text-ink text-xs max-[580px]:text-[11px] gap-1.5 max-[580px]:gap-1.5 min-h-[44px]",
          className
        )}
        onClick={() => setModalOpen(true)}
        aria-label="Share recipe"
        title="Share recipe"
      >
        <Share2 size={15} />
        <span>Share</span>
      </TextButton>

      {modalOpen && (
        <div
          className="modal-backdrop fixed inset-0 z-[1050] flex items-center justify-center p-5 bg-[#121e18]/60 backdrop-blur-sm animate-backdrop-fade"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="modal-panel recipe-share-modal w-full max-w-[460px] bg-white border border-[#e3ded4] rounded-[20px] max-h-[90vh] p-6 md:p-7 relative overflow-y-auto shadow-[0_32px_80px_rgba(18,32,24,0.28)] animate-panel-scale"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-recipe-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between mb-3">
              <h2
                id="share-recipe-modal-title"
                className="font-serif text-ink text-2xl font-semibold m-0 tracking-[-0.01em]"
              >
                Share recipe
              </h2>
              <IconButton
                variant="default"
                size="sm"
                className="rounded-full focus:outline-none focus-visible:outline-none focus-visible:bg-ink/[0.08]"
                onClick={() => setModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </IconButton>
            </div>

            <p className="text-muted text-sm leading-relaxed m-0 mb-4">
              Anyone with this link can view this recipe on mise.
            </p>

            <div className="share-link-box flex items-center gap-2 p-2.5 rounded-xl border border-[#e3ded4] bg-[#f8f5ee]/70 mb-4">
              {loadingToken ? (
                <Loader2 size={16} className="text-muted shrink-0 ml-1 spin-icon animate-spin" />
              ) : (
                <Link2 size={16} className="text-muted shrink-0 ml-1" />
              )}
              <input
                type="text"
                readOnly
                value={loadingToken ? "Generating secure link..." : shareUrl}
                aria-label="Recipe share link"
                disabled={loadingToken}
                className="bg-transparent border-0 text-ink text-xs font-mono flex-1 min-w-0 outline-none select-all disabled:opacity-60"
                onFocus={(e) => e.target.select()}
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <Button
                ref={copyBtnRef}
                type="button"
                variant="primary"
                size="default"
                disabled={loadingToken}
                className="w-full justify-center gap-2 min-h-[44px]"
                onClick={handleCopyLink}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? "Copied to clipboard!" : "Copy recipe link"}</span>
              </Button>

              {canNativeShare && (
                <Button
                  type="button"
                  variant="light"
                  size="default"
                  disabled={loadingToken}
                  className="w-full justify-center gap-2 min-h-[44px]"
                  onClick={handleNativeShare}
                >
                  <Share2 size={16} />
                  <span>Share via apps...</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
