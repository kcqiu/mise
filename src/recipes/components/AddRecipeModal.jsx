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

export default function AddRecipeModal({
  isOpen,
  onClose,
  onSelectManual,
  onParsedRecipe,
  onImportFile,
  onError,
}) {
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);
  const filePickerActiveRef = useRef(false);

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
      className="add-recipe-modal"
      onCancel={(e) => {
        e.stopPropagation();
        if (filePickerActiveRef.current) {
          filePickerActiveRef.current = false;
          return;
        }
        onClose();
      }}
    >
      <div className="add-recipe-modal__box">
        <header className="add-recipe-modal__header">
          {view !== "menu" ? (
            <button
              type="button"
              className="icon-button add-recipe-modal__back"
              onClick={() => {
                setView("menu");
                setErrorMsg("");
              }}
              disabled={loading}
              aria-label="Back to creation options"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="add-recipe-modal__brand-icon">
              <ChefHat size={20} strokeWidth={1.4} />
            </div>
          )}

          <div className="add-recipe-modal__titles">
            <span className="eyebrow add-recipe-modal__eyebrow">
              <Sparkles size={13} className="sparkle-gold" />
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
            <h2>
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

          <button
            type="button"
            className="icon-button add-recipe-modal__close"
            onClick={onClose}
            aria-label="Close intake dialog"
            disabled={loading}
          >
            <X size={18} />
          </button>
        </header>

        {errorMsg && (
          <div className="add-recipe-modal__error" role="alert">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* 1. Hub / Submenu View */}
        {view === "menu" && (
          <div className="add-recipe-modal__hub">
            <p className="add-recipe-modal__lead">
              Choose how you&apos;d like to add this recipe to your shelf:
            </p>

            <div className="add-recipe-cards">
              {/* Option A: Manual Entry */}
              <button
                type="button"
                className="add-recipe-card"
                onClick={() => {
                  onSelectManual();
                  onClose();
                }}
              >
                <div className="add-recipe-card__icon">
                  <PenLine size={20} />
                </div>
                <div className="add-recipe-card__info">
                  <strong>Manual entry</strong>
                  <p>
                    Write from scratch with your own measurements. MISE AI will
                    automatically polish and organize steps on save.
                  </p>
                </div>
              </button>

              {/* Option B: Scan from Photo */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai"
                onClick={() => setView("photo")}
              >
                <div className="add-recipe-card__icon">
                  <Camera size={20} />
                </div>
                <div className="add-recipe-card__info">
                  <div className="add-recipe-card__title-row">
                    <strong>Scan from photo</strong>
                    <span className="ai-badge">Gemini AI</span>
                  </div>
                  <p>
                    Upload a snapshot of a handwritten card, cookbook page, or
                    finished dish. Gemini extracts ingredients and steps instantly.
                  </p>
                </div>
              </button>

              {/* Option C: Paste from Text */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai"
                onClick={() => setView("text")}
              >
                <div className="add-recipe-card__icon">
                  <FileText size={20} />
                </div>
                <div className="add-recipe-card__info">
                  <div className="add-recipe-card__title-row">
                    <strong>Paste from text</strong>
                    <span className="ai-badge">Gemini AI</span>
                  </div>
                  <p>
                    Paste rough notes, messy ingredients dumps, or message transcripts.
                    Gemini structures, scales, and organizes them cleanly.
                  </p>
                </div>
              </button>

              {/* Option D: From Recipe Website */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai"
                onClick={() => setView("url")}
              >
                <div className="add-recipe-card__icon">
                  <Globe size={20} />
                </div>
                <div className="add-recipe-card__info">
                  <div className="add-recipe-card__title-row">
                    <strong>From recipe website</strong>
                    <span className="ai-badge">Gemini AI</span>
                  </div>
                  <p>
                    Import from NYT Cooking, Serious Eats, or food blogs without
                    the ads, popups, or life-story filler.
                  </p>
                </div>
              </button>

              {/* Option E: From Social Media */}
              <button
                type="button"
                className="add-recipe-card add-recipe-card--ai"
                onClick={() => setView("social")}
              >
                <div className="add-recipe-card__icon">
                  <Video size={20} />
                </div>
                <div className="add-recipe-card__info">
                  <div className="add-recipe-card__title-row">
                    <strong>From TikTok, Instagram, or YouTube</strong>
                    <span className="ai-badge">Gemini AI</span>
                  </div>
                  <p>
                    Paste a video link. Gemini extracts the recipe from the caption
                    and embeds the playable video on the card.
                  </p>
                </div>
              </button>
            </div>

            <div className="add-recipe-modal__hub-footer">
              <span>Have an existing recipe JSON or backup file?</span>
              <button
                type="button"
                className="text-button add-recipe-modal__file-import-btn"
                onClick={() => {
                  onImportFile?.();
                  onClose();
                }}
              >
                <Upload size={14} />
                <span>Import file</span>
              </button>
            </div>
          </div>
        )}

        {/* 2. Photo Scan View */}
        {view === "photo" && (
          <div className="add-recipe-modal__form-view">
            <p className="add-recipe-modal__view-desc">
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
              className={`photo-dropzone ${photoPreview ? "has-preview" : ""}`}
              onClick={() => {
                filePickerActiveRef.current = true;
                fileInputRef.current?.click();
              }}
            >
              {photoPreview ? (
                <div className="photo-preview-wrap">
                  <img src={photoPreview} alt="Recipe source snapshot" />
                  <div className="photo-preview-overlay">
                    <Camera size={20} />
                    <span>Click to change photo</span>
                  </div>
                </div>
              ) : (
                <div className="photo-dropzone-empty">
                  <div className="photo-dropzone-icon">
                    <Upload size={28} />
                  </div>
                  <strong>Choose a recipe photo or snap a picture</strong>
                  <small>JPG, PNG, or WebP up to 15MB</small>
                </div>
              )}
            </div>

            <div className="add-recipe-modal__actions">
              <button
                type="button"
                className="button button--light"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button ai-primary-btn"
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
              </button>
            </div>
          </div>
        )}

        {/* 3. Text Paste View */}
        {view === "text" && (
          <form onSubmit={handleExecuteTextParse} className="add-recipe-modal__form-view">
            <p className="add-recipe-modal__view-desc">
              Paste messy cooking notes, a dump of ingredients, or instructions from a chat.
              Gemini AI will structure, scale, and standardize it into a clean recipe.
            </p>

            <textarea
              className="add-recipe-textarea"
              rows={8}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste recipe text here...&#10;&#10;Example:&#10;Crispy Garlic Butter Salmon&#10;2 salmon fillets, 3 tbsp butter, 4 cloves garlic minced, fresh dill, lemon juice.&#10;Season salmon with salt and pepper. Sear in hot pan with oil skin-side down for 5 mins..."
              required
              disabled={loading}
              autoFocus
            />

            <div className="add-recipe-modal__actions">
              <button
                type="button"
                className="button button--light"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button ai-primary-btn"
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
              </button>
            </div>
          </form>
        )}

        {/* 4. Recipe Website URL View */}
        {view === "url" && (
          <form onSubmit={handleExecuteUrlImport} className="add-recipe-modal__form-view">
            <p className="add-recipe-modal__view-desc">
              Paste the URL of any recipe website or food blog. We will bypass popups,
              ad banners, and life stories to extract the pure culinary recipe.
            </p>

            <div className="input-with-icon">
              <Globe size={18} className="input-lead-icon" />
              <input
                type="url"
                className="add-recipe-input"
                placeholder="https://www.seriouseats.com/the-best-crispy-roast-potatoes"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="url-suggestions">
              <span className="url-suggestions-label">Works with:</span>
              <span className="tag-pill">NYT Cooking</span>
              <span className="tag-pill">Serious Eats</span>
              <span className="tag-pill">Bon Appétit</span>
              <span className="tag-pill">Sally&apos;s Baking</span>
              <span className="tag-pill">Allrecipes</span>
              <span className="tag-pill">Food blogs</span>
            </div>

            <div className="add-recipe-modal__actions">
              <button
                type="button"
                className="button button--light"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button ai-primary-btn"
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
              </button>
            </div>
          </form>
        )}

        {/* 5. Social Media Video View */}
        {view === "social" && (
          <form onSubmit={handleExecuteSocialImport} className="add-recipe-modal__form-view">
            <p className="add-recipe-modal__view-desc">
              Paste a public video link from TikTok, Instagram Reels, or YouTube.
              Gemini will extract the recipe from the caption and embed the playable video.
            </p>

            <div className="input-with-icon">
              <Video size={18} className="input-lead-icon" />
              <input
                type="url"
                className="add-recipe-input"
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
              <div className="add-recipe-modal__caption-group">
                <div className="add-recipe-modal__caption-header">
                  <label htmlFor="social-caption-input" className="add-recipe-modal__caption-label">
                    Post caption / recipe text
                  </label>
                  {/instagram\.com/i.test(socialInput) && (
                    <span className="caption-badge">Recommended for Instagram</span>
                  )}
                </div>
                <textarea
                  id="social-caption-input"
                  className="add-recipe-textarea add-recipe-textarea--caption"
                  rows={4}
                  placeholder="Paste the caption or ingredient list from the Instagram post here..."
                  value={socialCaption}
                  onChange={(e) => setSocialCaption(e.target.value)}
                  disabled={loading}
                />
                <p className="add-recipe-modal__caption-hint">
                  {/instagram\.com/i.test(socialInput)
                    ? "Meta restricts automated caption scraping from cloud servers. Pasting the caption ensures 100% accurate recipe extraction while MISE embeds your playable Reel!"
                    : "If the video doesn't have a public text description, paste the recipe notes or ingredient list here."}
                </p>
              </div>
            )}

            <div className="url-suggestions">
              <span className="url-suggestions-label">Supported platforms:</span>
              <span className="tag-pill tag-pill--social">TikTok</span>
              <span className="tag-pill tag-pill--social">Instagram Reels</span>
              <span className="tag-pill tag-pill--social">YouTube / Shorts</span>
            </div>

            <div className="add-recipe-modal__actions">
              <button
                type="button"
                className="button button--light"
                onClick={() => setView("menu")}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button ai-primary-btn"
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
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
