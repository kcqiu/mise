import { useEffect, useState } from "react";
import { Check, Share2 } from "lucide-react";
import { TextButton } from "@/components/ui/TextButton";
import { cn } from "@/lib/utils";

export function getShareUrl(recipeId) {
  if (typeof window === "undefined") return `#/recipe/${recipeId}`;
  return `${window.location.origin}${window.location.pathname}#/recipe/${recipeId}`;
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
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!recipe) return null;

  const handleShare = async () => {
    const shareUrl = getShareUrl(recipe.id);
    const shareTitle = recipe.title ? `${recipe.title} | mise.` : "mise. recipe";
    const shareText =
      recipe.description || `Check out this recipe for ${recipe.title} on mise.`;

    const shareData = {
      title: shareTitle,
      text: shareText,
      url: shareUrl,
    };

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        if (!navigator.canShare || navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      } catch (err) {
        if (err.name === "AbortError") {
          return;
        }
      }
    }

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        copyTextFallback(shareUrl);
      }
      setCopied(true);
      onToast?.("Recipe link copied to clipboard", "info");
    } catch {
      const fallbackOk = copyTextFallback(shareUrl);
      if (fallbackOk) {
        setCopied(true);
        onToast?.("Recipe link copied to clipboard", "info");
      } else {
        onToast?.("Failed to copy link to clipboard", "error");
      }
    }
  };

  return (
    <TextButton
      className={cn(
        "text-muted hover:text-ink text-xs max-[580px]:text-[11px] gap-1.5 max-[580px]:gap-1.5 min-h-[44px]",
        copied && "text-[#234d3c] hover:text-[#234d3c]",
        className
      )}
      onClick={handleShare}
      aria-label={copied ? "Recipe link copied" : "Share recipe"}
      title={copied ? "Link copied!" : "Share recipe"}
    >
      {copied ? <Check size={15} className="text-[#234d3c]" /> : <Share2 size={15} />}
      <span>{copied ? "Copied link!" : "Share"}</span>
    </TextButton>
  );
}
