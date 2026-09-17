import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  ChefHat,
  FileText,
  Globe,
  Loader2,
  PenLine,
  Sparkles,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  parseRecipeFromPhoto,
  parseRecipeFromSocial,
  parseRecipeFromText,
  parseRecipeFromUrl,
} from "../ai";
import Button from "../../components/ui/Button";
import IconButton from "../../components/ui/IconButton";

export default function AddRecipeModal({
  isOpen,
  onClose,
  onSelectManual,
  onParsedRecipe,
  requireAuth = false,
  onRequireAuth,
}) {
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);
  const filePickerActiveRef = useRef(false);

  const handleOptionClick = (action) => {
    if (requireAuth) {
      onRequireAuth?.();
      return;
    }
    action();
  };

  // 'menu' | 'photo' | 'text' | 'url' | 'social'
  const [view, setView] = useState("menu");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Form states
  const [textInput, setTextInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [socialInput, setSocialInput] = useState("");
  const [socialCaption, setSocialCaption] = useState("");
  const [showSocialCaption, setShowSocialCaption] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setView("menu");
      setLoading(false);
      setErrorMsg("");
      setTextInput("");
      setUrlInput("");
      setSocialInput("");
      setSocialCaption("");
      setShowSocialCaption(false);
      setSelectedPhoto(null);
      setPhotoPreview("");
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }

      const handleBackdropClick = (event) => {
        if (filePickerActiveRef.current) return;
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

      dialog.addEventListener("click", handleBackdropClick);
      return () => dialog.removeEventListener("click", handleBackdropClick);
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen, onClose]);

  const handlePhotoSelect = (event) => {
    filePickerActiveRef.current = false;
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please select an image file (JPG, PNG, WebP).");
      return;
    }

    setSelectedPhoto(file);
    setErrorMsg("");
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleExecutePhotoScan = async () => {
    if (!selectedPhoto) return;
    setLoading(true);
    setErrorMsg("");
    setLoadingStep("Analyzing photo with Gemini AI...");

    try {
      const parsed = await parseRecipeFromPhoto(selectedPhoto);
      // If photo has preview, attach as candidate artwork
      if (photoPreview && !parsed.artwork) {
        parsed.artwork = photoPreview;
      }
      onParsedRecipe(parsed);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Could not extract recipe from this photo.");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteTextParse = async (event) => {
    event.preventDefault();
    if (!textInput.trim()) return;
    setLoading(true);
    setErrorMsg("");
    setLoadingStep("Structuring recipe with Gemini AI...");

    try {
      const parsed = await parseRecipeFromText(textInput.trim());
      onParsedRecipe(parsed);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Could not parse this text.");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteUrlImport = async (event) => {
    event.preventDefault();
    if (!urlInput.trim()) return;
    setLoading(true);
    setErrorMsg("");
    setLoadingStep("Fetching website & synthesizing recipe...");

    try {
      const parsed = await parseRecipeFromUrl(urlInput.trim());
      onParsedRecipe(parsed);
      onClose();
    } catch (err) {
      setErrorMsg(
        err.message || "Could not import from this URL. You can paste the text instead."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSocialImport = async (event) => {
    event.preventDefault();
    if (!socialInput.trim()) return;
    setLoading(true);
    setErrorMsg("");
    setLoadingStep("Analyzing video captions and culinary steps...");

    try {
      const parsed = await parseRecipeFromSocial(
        socialInput.trim(),
        socialCaption.trim(),
      );
      onParsedRecipe(parsed);
      onClose();
    } catch (err) {
      if (err.requiresCaption) {
        setShowSocialCaption(true);
      }
      setErrorMsg(
        err.message || "Could not extract recipe from this video link."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="add-recipe-modal w-[min(94vw,620px)] max-w-[620px] text-ink bg-transparent border-0 m-auto p-0"
      onCancel={(e) => {
        e.stopPropagation();
        if (filePickerActiveRef.current) {
          filePickerActiveRef.current = false;
          return;
        }
        onClose();
      }}
    >
      <div className="add-recipe-modal__box border border-line bg-white rounded-[18px] max-h-[90vh] p-5 sm:p-7 md:px-[30px] relative overflow-y-auto shadow-[0_28px_72px_rgba(22,38,29,0.25)] animate-modal-enter">
        <header className="add-recipe-modal__header flex items-start gap-3.5 mb-5 relative">
          {view !== "menu" ? (
            <IconButton
              variant="default"
              size="default"
              className="add-recipe-modal__back shrink-0 mt-0.5"
              onClick={() => {
                setView("menu");
                setErrorMsg("");
              }}
              disabled={loading}
              aria-label="Back to creation options"
            >
              <ArrowLeft size={18} />
            </IconButton>
          ) : (
            <div className="add-recipe-modal__brand-icon w-10 h-10 text-ink bg-[#ebf2eb] rounded-[10px] shrink-0 flex items-center justify-center">
              <ChefHat size={20} strokeWidth={1.4} />
            </div>
          )}

          <div className="add-recipe-modal__titles flex-1 min-w-0">
            <span className="add-recipe-modal__eyebrow inline-flex items-center gap-1.5 uppercase tracking-[0.04em] text-ink text-[11px] font-semibold mb-1">
              <Sparkles size={13} className="text-[#c98a28]" />
              {view === "menu"
                ? "Add to your cookbook"
                : view === "photo"
                ? "Gemini Vision Scanner"
                : view === "text"
                ? "Gemini Text Structurer"
                : view === "url"
                ? "Web Recipe Importer"
                : "Social Video Extractor"}
            </span>
            <h2 className="font-serif font-normal text-2xl leading-[1.2] text-ink m-0">
              {view === "menu"
                ? "The recipe intake."
                : view === "photo"
                ? "Scan from photo"
                : view === "text"
                ? "Paste from text"
                : view === "url"
                ? "From recipe website"
                : "From TikTok, Instagram, or YouTube"}
            </h2>
          </div>

          <IconButton
            variant="default"
            size="default"
            className="add-recipe-modal__close shrink-0 -mt-1 -mr-1.5 rounded-full focus:outline-none focus-visible:outline-none focus-visible:bg-ink/[0.08]"
            onClick={onClose}
            aria-label="Close intake dialog"
            disabled={loading}
          >
            <X size={18} />
          </IconButton>
        </header>

        {errorMsg && (
          <div className="add-recipe-modal__error flex items-start gap-2.5 p-3.5 mb-[18px] rounded-lg bg-[#fdf2f0] border border-[#f7ceca] text-[#99281a] text-[13px] leading-[1.45]" role="alert">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Hub / Submenu View */}
        {view === "menu" && (
          <div className="add-recipe-modal__hub">
            <p className="add-recipe-modal__lead text-muted text-sm m-0 mb-4">
              Choose how you&apos;d like to add this recipe to your shelf:
            </p>

            <div className="add-recipe-cards flex flex-col gap-2.5">
              {/* Option A: Manual Entry */}
              <button
                type="button"
                className="add-recipe-card group flex items-start gap-4 w-full p-4 md:px-[18px] rounded-xl border border-line bg-[#fcfdfa] text-left cursor-pointer transition-all duration-200 hover:border-ink hover:bg-white hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(36,35,31,0.08)]"
                onClick={() =>
                  handleOptionClick(() => {
                    onSelectManual();
                    onClose();
                  })
                }
              >
                <div className="add-recipe-card__icon w-[38px] h-[38px] rounded-[9px] bg-[#edf2eb] text-ink shrink-0 flex items-center justify-center mt-0.5 transition-all duration-200 group-hover:bg-ink group-hover:text-white group-hover:scale-105">
                  <PenLine size={20} />
                </div>
                <div className="add-recipe-card__info flex-1 min-w-0">
                  <strong className="block text-ink text-sm font-semibold mb-0.5">Manual entry</strong>
                  <p className="text-muted text-xs leading-[1.45] m-0 mt-1">
                    Write from scratch with your own measurements. Refine and
                    organize steps with AI on demand.
                  </p>
                </div>
              </button>

              {/* Option B: Scan from Photo */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai group flex items-start gap-4 w-full p-4 md:px-[18px] rounded-xl border border-line bg-[#fcfdfa] text-left cursor-pointer transition-all duration-200 hover:border-[#d4a34b] hover:bg-white hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,163,75,0.12)]"
                onClick={() => handleOptionClick(() => setView("photo"))}
              >
                <div className="add-recipe-card__icon w-[38px] h-[38px] rounded-[9px] bg-[#edf2eb] text-ink shrink-0 flex items-center justify-center mt-0.5 transition-all duration-200 group-hover:bg-[#c98a28] group-hover:text-white group-hover:scale-105">
                  <Camera size={20} />
                </div>
                <div className="add-recipe-card__info flex-1 min-w-0">
                  <div className="add-recipe-card__title-row flex items-start sm:items-center gap-2 mb-0.5">
                    <strong className="block text-ink text-sm font-semibold">Scan from photo</strong>
                    <span className="ai-badge inline-flex items-center shrink-0 whitespace-nowrap gap-1 ml-0.5 px-[7px] py-0.5 rounded-full border border-[#e8cd98] bg-gradient-to-br from-[#fbf2dc] to-[#f7e6c3] text-[#8c5b16] text-[10px] font-bold uppercase tracking-[0.04em] leading-normal">Gemini AI</span>
                  </div>
                  <p className="text-muted text-xs leading-[1.45] m-0 mt-1">
                    Upload a snapshot of a handwritten card, cookbook page, or
                    finished dish. Gemini extracts ingredients and steps instantly.
                  </p>
                </div>
              </button>

              {/* Option C: Paste from Text */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai group flex items-start gap-4 w-full p-4 md:px-[18px] rounded-xl border border-line bg-[#fcfdfa] text-left cursor-pointer transition-all duration-200 hover:border-[#d4a34b] hover:bg-white hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,163,75,0.12)]"
                onClick={() => handleOptionClick(() => setView("text"))}
              >
                <div className="add-recipe-card__icon w-[38px] h-[38px] rounded-[9px] bg-[#edf2eb] text-ink shrink-0 flex items-center justify-center mt-0.5 transition-all duration-200 group-hover:bg-[#c98a28] group-hover:text-white group-hover:scale-105">
                  <FileText size={20} />
                </div>
                <div className="add-recipe-card__info flex-1 min-w-0">
                  <div className="add-recipe-card__title-row flex items-start sm:items-center gap-2 mb-0.5">
                    <strong className="block text-ink text-sm font-semibold">Paste from text</strong>
                    <span className="ai-badge inline-flex items-center shrink-0 whitespace-nowrap gap-1 ml-0.5 px-[7px] py-0.5 rounded-full border border-[#e8cd98] bg-gradient-to-br from-[#fbf2dc] to-[#f7e6c3] text-[#8c5b16] text-[10px] font-bold uppercase tracking-[0.04em] leading-normal">Gemini AI</span>
                  </div>
                  <p className="text-muted text-xs leading-[1.45] m-0 mt-1">
                    Paste rough notes, messy ingredients dumps, or message transcripts.
                    Gemini structures, scales, and organizes them cleanly.
                  </p>
                </div>
              </button>

              {/* Option D: From Recipe Website */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai group flex items-start gap-4 w-full p-4 md:px-[18px] rounded-xl border border-line bg-[#fcfdfa] text-left cursor-pointer transition-all duration-200 hover:border-[#d4a34b] hover:bg-white hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,163,75,0.12)]"
                onClick={() => handleOptionClick(() => setView("url"))}
              >
                <div className="add-recipe-card__icon w-[38px] h-[38px] rounded-[9px] bg-[#edf2eb] text-ink shrink-0 flex items-center justify-center mt-0.5 transition-all duration-200 group-hover:bg-[#c98a28] group-hover:text-white group-hover:scale-105">
                  <Globe size={20} />
                </div>
                <div className="add-recipe-card__info flex-1 min-w-0">
                  <div className="add-recipe-card__title-row flex items-start sm:items-center gap-2 mb-0.5">
                    <strong className="block text-ink text-sm font-semibold">From recipe website</strong>
                    <span className="ai-badge inline-flex items-center shrink-0 whitespace-nowrap gap-1 ml-0.5 px-[7px] py-0.5 rounded-full border border-[#e8cd98] bg-gradient-to-br from-[#fbf2dc] to-[#f7e6c3] text-[#8c5b16] text-[10px] font-bold uppercase tracking-[0.04em] leading-normal">Gemini AI</span>
                  </div>
                  <p className="text-muted text-xs leading-[1.45] m-0 mt-1">
                    Import from NYT Cooking, Serious Eats, or food blogs without
                    the ads, popups, or life-story filler.
                  </p>
                </div>
              </button>

              {/* Option E: From Social Media */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai group flex items-start gap-4 w-full p-4 md:px-[18px] rounded-xl border border-line bg-[#fcfdfa] text-left cursor-pointer transition-all duration-200 hover:border-[#d4a34b] hover:bg-white hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,163,75,0.12)]"
                onClick={() => handleOptionClick(() => setView("social"))}
              >
                <div className="add-recipe-card__icon w-[38px] h-[38px] rounded-[9px] bg-[#edf2eb] text-ink shrink-0 flex items-center justify-center mt-0.5 transition-all duration-200 group-hover:bg-[#c98a28] group-hover:text-white group-hover:scale-105">
                  <Video size={20} />
                </div>
                <div className="add-recipe-card__info flex-1 min-w-0">
                  <div className="add-recipe-card__title-row flex items-start sm:items-center gap-2 mb-0.5">
                    <strong className="block text-ink text-sm font-semibold">From TikTok, Instagram, or YouTube</strong>
                    <span className="ai-badge inline-flex items-center shrink-0 whitespace-nowrap gap-1 ml-0.5 px-[7px] py-0.5 rounded-full border border-[#e8cd98] bg-gradient-to-br from-[#fbf2dc] to-[#f7e6c3] text-[#8c5b16] text-[10px] font-bold uppercase tracking-[0.04em] leading-normal">Gemini AI</span>
                  </div>
                  <p className="text-muted text-xs leading-[1.45] m-0 mt-1">
                    Paste a video link. Gemini extracts the recipe from the caption
                    and embeds the playable video on the card.
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* 2. Photo Scan View */}
        {view === "photo" && (
          <div className="add-recipe-modal__form-view flex flex-col gap-4">
            <p className="add-recipe-modal__view-desc text-muted text-[13px] leading-[1.55] m-0">
              Upload an image of a cookbook page, handwritten recipe card, or plated dish.
              Gemini Vision will extract ingredients, measurements, and directions.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handlePhotoSelect}
            />

            <div
              className={`photo-dropzone text-center cursor-pointer rounded-xl transition-all duration-200 border-2 ${photoPreview ? "has-preview border-solid border-line p-2.5 bg-white" : "border-dashed border-[#ccd6c8] p-6 bg-[#fcfdfb] hover:border-ink hover:bg-[#f6faf5]"}`}
              onClick={() => {
                filePickerActiveRef.current = true;
                fileInputRef.current?.click();
              }}
            >
              {photoPreview ? (
                <div className="photo-preview-wrap relative rounded-lg overflow-hidden w-full max-h-[260px] group">
                  <img src={photoPreview} alt="Recipe source snapshot" className="w-full h-60 object-cover block" />
                  <div className="photo-preview-overlay absolute inset-0 bg-[#121c17]/45 text-white flex flex-col items-center justify-center gap-1.5 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Camera size={20} />
                    <span>Click to change photo</span>
                  </div>
                </div>
              ) : (
                <div className="photo-dropzone-empty flex flex-col items-center gap-1.5">
                  <div className="photo-dropzone-icon w-[52px] h-[52px] rounded-full bg-[#edf3eb] text-ink flex items-center justify-center mb-1">
                    <Upload size={28} />
                  </div>
                  <strong className="text-ink text-sm font-semibold">Choose a recipe photo or snap a picture</strong>
                  <small className="text-muted text-xs">JPG, PNG, or WebP up to 15MB</small>
                </div>
              )}
            </div>

            <div className="add-recipe-modal__actions flex items-center justify-end gap-2.5 mt-2.5">
              <Button
                type="button"
                variant="light"
                size="action"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="action"
                disabled={!selectedPhoto || loading}
                onClick={handleExecutePhotoScan}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    <span>{loadingStep || "Scanning with Gemini..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Scan with Gemini</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* 3. Text Paste View */}
        {view === "text" && (
          <form onSubmit={handleExecuteTextParse} className="add-recipe-modal__form-view flex flex-col gap-4">
            <p className="add-recipe-modal__view-desc text-muted text-[13px] leading-[1.55] m-0">
              Paste messy cooking notes, a dump of ingredients, or instructions from a chat.
              Gemini AI will structure, scale, and standardize it into a clean recipe.
            </p>

            <textarea
              className="add-recipe-textarea w-full min-h-[160px] p-3.5 md:p-4 rounded-[10px] border border-line bg-white text-ink text-[13px] leading-[1.6] resize-y transition-all focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-60"
              rows={8}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste recipe text here...&#10;&#10;Example:&#10;Crispy Garlic Butter Salmon&#10;2 salmon fillets, 3 tbsp butter, 4 cloves garlic minced, fresh dill, lemon juice.&#10;Season salmon with salt and pepper. Sear in hot pan with oil skin-side down for 5 mins..."
              required
              disabled={loading}
              autoFocus
            />

            <div className="add-recipe-modal__actions flex items-center justify-end gap-2.5 mt-2.5">
              <Button
                type="button"
                variant="light"
                size="action"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="action"
                disabled={!textInput.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    <span>{loadingStep || "Structuring..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Parse with Gemini</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* 4. Recipe Website URL View */}
        {view === "url" && (
          <form onSubmit={handleExecuteUrlImport} className="add-recipe-modal__form-view flex flex-col gap-4">
            <p className="add-recipe-modal__view-desc text-muted text-[13px] leading-[1.55] m-0">
              Paste the URL of any recipe website or food blog. We will bypass popups,
              ad banners, and life stories to extract the pure culinary recipe.
            </p>

            <div className="input-with-icon relative flex items-center">
              <Globe size={18} className="input-lead-icon absolute left-3.5 text-muted pointer-events-none" />
              <input
                type="url"
                className="add-recipe-input w-full pl-[42px] pr-3.5 py-3 rounded-[9px] border border-line bg-white text-ink text-sm transition-all focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-60"
                placeholder="https://www.seriouseats.com/the-best-crispy-roast-potatoes"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="add-recipe-modal__actions flex items-center justify-end gap-2.5 mt-2.5">
              <Button
                type="button"
                variant="light"
                size="action"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="action"
                disabled={!urlInput.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    <span>{loadingStep || "Importing..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Import Recipe</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* 5. Social Media Video View */}
        {view === "social" && (
          <form onSubmit={handleExecuteSocialImport} className="add-recipe-modal__form-view flex flex-col gap-4">
            <p className="add-recipe-modal__view-desc text-muted text-[13px] leading-[1.55] m-0">
              Paste a public video link from TikTok, Instagram Reels, or YouTube.
              Gemini will extract the recipe from the caption and embed the playable video.
            </p>

            <div className="input-with-icon relative flex items-center">
              <Video size={18} className="input-lead-icon absolute left-3.5 text-muted pointer-events-none" />
              <input
                type="url"
                className="add-recipe-input w-full pl-[42px] pr-3.5 py-3 rounded-[9px] border border-line bg-white text-ink text-sm transition-all focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-60"
                placeholder="https://www.tiktok.com/@creator/video/... or https://youtube.com/watch?v=..."
                value={socialInput}
                onChange={(e) => {
                  setSocialInput(e.target.value);
                  if (/instagram\.com/i.test(e.target.value)) {
                    setShowSocialCaption(true);
                  }
                }}
                required
                disabled={loading}
                autoFocus
              />
            </div>

            {(/instagram\.com/i.test(socialInput) || showSocialCaption) && (
              <div className="add-recipe-modal__caption-group flex flex-col gap-2 mt-1 p-3 rounded-[10px] border border-line bg-black/[0.02]">
                <div className="add-recipe-modal__caption-header flex flex-wrap items-center justify-between gap-1.5">
                  <label htmlFor="social-caption-input" className="add-recipe-modal__caption-label flex items-center gap-1.5 text-ink text-xs font-semibold">
                    Post caption / recipe text
                  </label>
                  {/instagram\.com/i.test(socialInput) && (
                    <span className="caption-badge inline-block px-1.5 py-0.5 rounded-full border border-[#e8cd98] bg-[#fbf2dc] text-[#8c5b16] text-[10px] font-semibold">Recommended for Instagram</span>
                  )}
                </div>
                <textarea
                  id="social-caption-input"
                  className="add-recipe-textarea add-recipe-textarea--caption w-full min-h-[85px] max-h-[180px] p-2.5 rounded-[10px] border border-line bg-white text-ink text-xs leading-normal resize-y transition-all focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20 disabled:opacity-60"
                  rows={4}
                  placeholder="Paste the caption or ingredient list from the Instagram post here..."
                  value={socialCaption}
                  onChange={(e) => setSocialCaption(e.target.value)}
                  disabled={loading}
                />
                <p className="add-recipe-modal__caption-hint text-muted text-[11px] leading-[1.45] m-0">
                  {/instagram\.com/i.test(socialInput)
                    ? "Try the link on its own, or paste the caption to skip automatic lookup. If the caption is unavailable, open the post and copy its recipe text here. Review the extracted recipe before saving."
                    : "If the video doesn't have a public text description, paste the recipe notes or ingredient list here."}
                </p>
              </div>
            )}

            <div className="url-suggestions flex flex-wrap items-center gap-1.5 text-xs">
              <span className="url-suggestions-label text-muted text-[11px] font-medium mr-0.5">Supported platforms:</span>
              <span className="tag-pill tag-pill--social px-2 py-0.5 rounded-md bg-[#fdf5e8] border border-[#fae4c2] text-[#8c5b16] text-[11px]">TikTok</span>
              <span className="tag-pill tag-pill--social px-2 py-0.5 rounded-md bg-[#fdf5e8] border border-[#fae4c2] text-[#8c5b16] text-[11px]">Instagram Reels</span>
              <span className="tag-pill tag-pill--social px-2 py-0.5 rounded-md bg-[#fdf5e8] border border-[#fae4c2] text-[#8c5b16] text-[11px]">YouTube / Shorts</span>
            </div>

            <div className="add-recipe-modal__actions flex items-center justify-end gap-2.5 mt-2.5">
              <Button
                type="button"
                variant="light"
                size="action"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="action"
                disabled={!socialInput.trim() || loading}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spin-icon" />
                    <span>{loadingStep || "Analyzing Video..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Extract &amp; Embed</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
