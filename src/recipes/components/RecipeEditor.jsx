import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Cloud,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { validateRecipe } from "../library";
import { uploadRecipeCover } from "../cloud";
import {
  enhanceRecipeWithGemini,
  generateRecipeCover,
} from "../ai";
import RecipeArtwork from "./RecipeArtwork";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { TextButton } from "@/components/ui/TextButton";
import { cn } from "@/lib/utils";

function cropAndCompressImage(file, targetSize = 800) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file provided"));
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      if (typeof document === "undefined") {
        resolve({ blob: file, dataUrl });
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({ blob: file, dataUrl });
            return;
          }
          // Symmetrical square center-crop
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(
            img,
            sx,
            sy,
            minDim,
            minDim,
            0,
            0,
            targetSize,
            targetSize,
          );
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve({ blob: file, dataUrl });
                return;
              }
              const webpDataUrl = canvas.toDataURL("image/webp", 0.85);
              resolve({ blob, dataUrl: webpDataUrl });
            },
            "image/webp",
            0.85,
          );
        } catch {
          resolve({ blob: file, dataUrl });
        }
      };
      img.onerror = () => resolve({ blob: file, dataUrl });
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const blankIngredient = () => ({
  quantity: "",
  unit: "",
  name: "",
  group: "",
  note: "",
});
const blankStep = () => ({ title: "", instruction: "" });
const blankRecipe = () => ({
  title: "",
  description: "",
  category: "Dinner",
  tags: [],
  cuisine: "",
  method: "",
  keywords: [],
  prepMinutes: 10,
  cookMinutes: 20,
  restMinutes: 0,
  servings: 2,
  artwork: "",
  sourceVideo: "",
  ingredients: [blankIngredient()],
  steps: [blankStep()],
  notes: [],
  substitutions: [],
  equipment: [],
});

export default function RecipeEditor({
  recipe,
  categories,
  onSave,
  onClose,
  onBack = null,
  onDelete,
  isLocal,
  isCloud = false,
  userId = null,
}) {
  const dialog = useRef(null);
  const fileInputRef = useRef(null);
  const filePickerActiveRef = useRef(false);
  const [processingCover, setProcessingCover] = useState(false);
  const [coverNotice, setCoverNotice] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [polishNotice, setPolishNotice] = useState("");
  const [draft, setDraft] = useState(() =>
    recipe
      ? {
          ...recipe,
          ingredients: recipe.ingredients.map((item) => ({
            ...item,
            quantity: item.quantity ?? "",
          })),
        }
      : blankRecipe(),
  );
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setItem = (key, index, field, value) =>
    set(
      key,
      draft[key].map((item, at) =>
        at === index ? { ...item, [field]: value } : item,
      ),
    );
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";

    const onWindowFocus = () => {
      setTimeout(() => {
        filePickerActiveRef.current = false;
      }, 400);
    };
    window.addEventListener("focus", onWindowFocus);

    const handleBackdropClick = (event) => {
      if (filePickerActiveRef.current) return;
      if (event.target !== element) return;
      const rect = element.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) onClose();
    };

    element.addEventListener("click", handleBackdropClick);

    return () => {
      window.removeEventListener("focus", onWindowFocus);
      element.removeEventListener("click", handleBackdropClick);
      element.close();
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProcessingCover(true);
    setCoverNotice("Cropping & optimizing photo...");
    try {
      const { blob, dataUrl } = await cropAndCompressImage(file, 800);
      let finalArtwork = dataUrl;
      if (isCloud && userId) {
        setCoverNotice("Uploading cover to your cloud cookbook...");
        try {
          const recipeId =
            (recipe && recipe.id) || draft.id || `recipe-${Date.now()}`;
          const publicUrl = await uploadRecipeCover(blob, recipeId, userId);
          if (publicUrl) {
            finalArtwork = publicUrl;
          }
        } catch (uploadErr) {
          console.warn("Storage upload fell back to local dataUrl", uploadErr);
        }
      }
      set("artwork", finalArtwork);
      setCoverNotice("Cover photo attached.");
      setTimeout(() => setCoverNotice(""), 3500);
    } catch {
      setCoverNotice("Could not process image file. Please try another.");
    } finally {
      setProcessingCover(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const validIngredients = (draft.ingredients || []).filter((i) => i.name?.trim());
  const validSteps = (draft.steps || []).filter((s) => s.instruction?.trim());
  const hasTitle = Boolean(draft.title?.trim() && draft.title.trim().length >= 3);
  const hasCategory = Boolean(draft.category?.trim());
  const hasIngredients = validIngredients.length >= 2;
  const hasSteps = validSteps.length >= 1;

  const canGenerateCover = hasTitle && hasCategory && hasIngredients && hasSteps;

  const coverMissingReasons = [];
  if (!hasTitle) coverMissingReasons.push("title (3+ chars)");
  if (!hasCategory) coverMissingReasons.push("category");
  if (!hasIngredients) coverMissingReasons.push(`${2 - validIngredients.length} more ingredient${validIngredients.length === 1 ? "" : "s"}`);
  if (!hasSteps) coverMissingReasons.push("at least 1 cooking step");

  const coverTooltip = canGenerateCover
    ? "Generate a realistic food photo with AI"
    : `Fill in most recipe info to enable AI photography (still needs: ${coverMissingReasons.join(", ")})`;

  const handleGenerateCover = async () => {
    if (!canGenerateCover) {
      setCoverNotice(`Please fill in most recipe info before generating: ${coverMissingReasons.join(", ")}.`);
      return;
    }
    setProcessingCover(true);
    setCoverNotice("Generating photorealistic food photo with AI...");
    try {
      const generatedUrl = await generateRecipeCover(draft, {
        userId: isCloud ? userId : null,
        recipeId: draft.id || (isLocal ? recipe.id : `recipe-${crypto.randomUUID()}`),
      });
      if (generatedUrl) {
        set("artwork", generatedUrl);
        setCoverNotice(isCloud ? "Photo generated and saved to your cloud cookbook!" : "Photo generated!");
        setTimeout(() => setCoverNotice(""), 4000);
      }
    } catch (err) {
      setCoverNotice(err.message || "Failed to generate photo.");
      setTimeout(() => setCoverNotice(""), 6000);
    } finally {
      setProcessingCover(false);
    }
  };

  const handleManualPolish = async () => {
    if (!draft.title.trim()) {
      setError("Please give your recipe a name before refining with AI.");
      return;
    }
    setPolishing(true);
    setPolishNotice("Polishing ingredient units and step directions with Gemini AI...");
    try {
      const polished = await enhanceRecipeWithGemini(draft);
      if (polished) {
        setDraft({
          ...polished,
          artwork: draft.artwork || polished.artwork || "",
          sourceVideo: draft.sourceVideo || polished.sourceVideo || "",
          ingredients: (polished.ingredients || []).map((item) => ({
            ...item,
            quantity: item.quantity ?? "",
          })),
        });
        setPolishNotice("Recipe polished by Gemini AI!");
        setTimeout(() => setPolishNotice(""), 4000);
      }
    } catch (err) {
      setPolishNotice(err.message || "Could not polish recipe.");
      setTimeout(() => setPolishNotice(""), 5000);
    } finally {
      setPolishing(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      const newId = isLocal
        ? recipe.id
        : `recipe-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10)}`;
      const saved = validateRecipe({
        ...draft,
        id: newId,
        example: false,
        createdAt: draft.createdAt || recipe?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        servings: Number(draft.servings),
        prepMinutes: Number(draft.prepMinutes),
        cookMinutes: Number(draft.cookMinutes),
        restMinutes: Number(draft.restMinutes),
        ingredients: draft.ingredients.map((item) => ({
          ...item,
          quantity: item.quantity === "" || item.quantity == null ? null : Number(item.quantity),
        })),
      });
      const problem = await onSave(saved);
      if (problem) setError(problem);
    } catch (problem) {
      setError(problem.message);
    }
  };
  return (
    <dialog
      ref={dialog}
      className={cn(
        "recipe-editor m-auto w-[min(920px,calc(100vw_-_48px))] max-w-none max-h-[calc(100svh_-_48px)] overflow-hidden rounded-lg border border-line bg-paper p-0 text-ink shadow-[0_25px_100px_#10241b33]",
        "max-[580px]:m-0 max-[580px]:h-[100svh] max-[580px]:max-h-[100svh] max-[580px]:w-screen max-[580px]:rounded-none max-[580px]:border-0"
      )}
      data-layout="centered-workspace"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        if (filePickerActiveRef.current || event.target !== dialog.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClose();
      }}
    >
      <form
        className="flex max-h-[inherit] min-h-0 flex-col max-[580px]:h-full"
        aria-label="Recipe editor form"
        onSubmit={submit}
      >
        <div className="editor-header z-[2] flex shrink-0 items-center justify-between gap-3.5 border-b border-line bg-paper px-8 pt-6 pb-5 max-[580px]:px-5 max-[580px]:pt-[max(22px,env(safe-area-inset-top))] max-[580px]:pb-[17px]">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <IconButton
                size="default"
                onClick={onBack}
                aria-label="Back to creation options"
                title="Back to creation options"
                className="rounded-full shrink-0 -ml-2 text-ink hover:bg-[rgba(36,35,31,0.06)]"
              >
                <ArrowLeft size={20} />
              </IconButton>
            )}
            <div>
              <span className="eyebrow block text-[10px] font-semibold tracking-[0.08em] uppercase text-muted">
                From your kitchen
              </span>
              <h2
                id="editor-title"
                className="font-serif font-normal text-[32px] mt-[7px] mb-0 leading-tight max-[580px]:text-[29px]"
              >
                {recipe ? "Make it yours." : "A new keeper."}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className="button ai-polish-btn inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3.5 py-2 text-xs font-[550] rounded-[4px] cursor-pointer transition-colors duration-150 border disabled:opacity-40 disabled:cursor-not-allowed select-none bg-[#eef5eb] text-[#2e5735] border-[#bdd2b7] hover:bg-[#e1edd8] hover:border-[#9cb894] focus-visible:outline-none focus-visible:bg-[#e1edd8] focus-visible:border-[#9cb894]"
              onClick={handleManualPolish}
              disabled={polishing}
              title="Standardize measurements and enhance culinary steps with Gemini AI"
            >
              {polishing ? (
                <>
                  <Loader2 size={13} className="spin-icon" />
                  <span>Refining...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  <span>Refine with AI</span>
                </>
              )}
            </button>
            <IconButton
              size="default"
              onClick={onClose}
              aria-label="Close recipe editor"
            >
              <X size={21} />
            </IconButton>
          </div>
        </div>
        {polishNotice && (
          <div
            className="editor-cover-notice mx-6 mb-3 text-emerald-800 font-semibold text-xs bg-[#eef3eb] px-2 py-1 rounded"
            role="status"
          >
            {polishNotice}
          </div>
        )}
        <div
          className="editor-content min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 pt-[26px] pb-[30px] max-[580px]:px-5 max-[580px]:py-[23px]"
          role="region"
          aria-label="Recipe fields"
        >
          <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
            Recipe name
            <input
              required
              autoFocus
              value={draft.title}
              maxLength={150}
              onChange={(event) => set("title", event.target.value)}
              placeholder="What are we making?"
              className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
            />
          </label>
          <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
            A little about it
            <textarea
              value={draft.description}
              maxLength={1000}
              onChange={(event) => set("description", event.target.value)}
              rows={2}
              placeholder="The version you always come back to."
              className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] leading-[1.6] resize-y focus:outline-none focus:border-ink/50 transition-colors"
            />
          </label>

          <div className="editor-cover-section bg-[#f7f9f5] border border-[#dbe3d7] rounded-lg mt-1 mb-6 p-4">
            <div className="editor-cover-header flex items-center justify-between mb-3">
              <span className="editor-cover-title text-[13px] font-semibold text-ink">
                Cover photo{" "}
                <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">
                  optional • auto-crops symmetrically
                </span>
              </span>
              {draft.artwork && (
                <button
                  type="button"
                  className="editor-cover-remove text-xs text-[#a5382b] underline bg-transparent border-0 p-0 cursor-pointer hover:text-[#8a2e23] transition-colors"
                  onClick={() => set("artwork", "")}
                >
                  Remove photo
                </button>
              )}
            </div>

            <div className="editor-cover-layout flex items-start gap-4 max-[600px]:flex-col max-[600px]:items-center">
              <div className="editor-cover-preview w-[110px] h-[110px] max-[600px]:w-[140px] max-[600px]:h-[140px] shrink-0 rounded-md bg-[#e8ede3] border border-[#d0dacb] overflow-hidden">
                <RecipeArtwork
                  artwork={draft.artwork}
                  title={draft.title || "Recipe preview"}
                  className="editor-cover-thumb w-full h-full aspect-square"
                />
              </div>

              <div className="editor-cover-controls flex flex-col flex-1 gap-2.5 min-w-0 w-full">
                <div className="editor-cover-buttons flex flex-wrap gap-2.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/avif"
                    className="sr-only"
                    id="recipe-cover-upload"
                    onClick={() => {
                      filePickerActiveRef.current = true;
                    }}
                    onCancel={(e) => {
                      e.stopPropagation();
                      setTimeout(() => {
                        filePickerActiveRef.current = false;
                      }, 400);
                    }}
                    onChange={(e) => {
                      handleFileSelect(e);
                      setTimeout(() => {
                        filePickerActiveRef.current = false;
                      }, 400);
                    }}
                  />
                  <Button
                    variant="light"
                    size="sm"
                    type="button"
                    className="editor-cover-btn min-h-[38px] px-3.5 py-2 text-[13px] gap-[7px]"
                    onClick={() => {
                      filePickerActiveRef.current = true;
                      fileInputRef.current?.click();
                    }}
                    disabled={processingCover}
                  >
                    {processingCover ? (
                      <>
                        <Loader2 size={15} className="spin-icon" />
                        <span>Cropping photo...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={15} />
                        <span>Upload photo</span>
                      </>
                    )}
                  </Button>

                  <button
                    type="button"
                    className="button ai-sparkle-button editor-cover-btn inline-flex items-center justify-center gap-[7px] min-h-[38px] px-3.5 py-2 text-[13px] font-[550] rounded-[4px] cursor-pointer transition-all duration-200 border disabled:opacity-40 disabled:cursor-not-allowed select-none bg-[#eef5eb] text-[#2e5735] border-[#bdd2b7] hover:bg-[#e1edd8] hover:border-[#9cb894]"
                    onClick={handleGenerateCover}
                    disabled={processingCover || !canGenerateCover}
                    title={coverTooltip}
                  >
                    {processingCover ? (
                      <>
                        <Loader2 size={15} className="spin-icon" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        <span>Generate with AI</span>
                        <span className="ai-badge bg-[#2e5735] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-[3px] ml-0.5 tracking-[0.05em]">
                          AI
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {!canGenerateCover && (
                  <p
                    className="editor-cover-hint text-[11px] text-muted mt-1 leading-[1.4] m-0"
                  >
                    ℹ️ To save on API tokens, fill in title, category, 2+ ingredients, and 1+ step to unlock AI photo generation.
                  </p>
                )}

                <div className="editor-cover-url-wrap w-full">
                  <input
                    type="url"
                    value={
                      draft.artwork?.startsWith("data:") ? "" : draft.artwork
                    }
                    placeholder="Or paste an image URL (Unsplash, ImgBB, Supabase...)"
                    className="w-full min-h-[38px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] px-3 py-1.5 text-[13px] max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
                    onChange={(event) =>
                      set("artwork", event.target.value.trim())
                    }
                  />
                </div>

                {coverNotice && (
                  <p className="editor-cover-notice text-xs text-[#38593c] bg-[#eef3eb] px-2 py-1 rounded leading-[1.4] m-0" role="status">
                    {coverNotice}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="form-grid grid grid-cols-2 gap-x-5 max-[580px]:gap-x-3.5">
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Category
              <input
                required
                list="recipe-categories"
                value={draft.category}
                maxLength={150}
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
                onChange={(event) => set("category", event.target.value)}
              />
              <datalist id="recipe-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Tags <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">comma-separated</span>
              <input
                value={draft.tags.join(",")}
                onChange={(event) => set("tags", event.target.value.split(","))}
                placeholder="Quick meals, Chicken"
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Prep time <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">minutes</span>
              <input
                required
                type="number"
                min="0"
                max="10080"
                value={draft.prepMinutes}
                onChange={(event) => set("prepMinutes", event.target.value)}
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Cook time <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">minutes</span>
              <input
                required
                type="number"
                min="0"
                max="10080"
                value={draft.cookMinutes}
                onChange={(event) => set("cookMinutes", event.target.value)}
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Rest time <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">minutes</span>
              <input
                required
                type="number"
                min="0"
                max="10080"
                value={draft.restMinutes}
                onChange={(event) => set("restMinutes", event.target.value)}
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Servings
              <input
                required
                type="number"
                min="1"
                max="100"
                value={draft.servings}
                onChange={(event) => set("servings", event.target.value)}
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Cuisine
              <input
                value={draft.cuisine}
                onChange={(event) => set("cuisine", event.target.value)}
                placeholder="Italian, Japanese-inspired..."
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Cooking method
              <input
                value={draft.method}
                onChange={(event) => set("method", event.target.value)}
                placeholder="Air fryer, stir fry, no cook..."
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
          </div>
          <fieldset className="border-0 border-t border-line min-w-0 mt-1.5 mb-[27px] pt-[26px] pb-1.5">
            <legend className="font-serif font-normal text-2xl pr-[15px] max-[580px]:text-[25px]">Ingredients</legend>
            {draft.ingredients.map((item, index) => (
              <div
                className="ingredient-fields grid grid-cols-[78px_82px_minmax(0,1fr)_32px] max-[580px]:grid-cols-[64px_68px_minmax(0,1fr)_30px] max-[370px]:grid-cols-[56px_56px_minmax(0,1fr)_28px] gap-x-2.5 max-[580px]:gap-x-[7px] mb-2.5"
                key={index}
              >
                <label className="block mb-2.5 text-xs font-[550] leading-[1.6]">
                  <span className="field-hint text-muted m-0 text-[10px] font-normal">Amount</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="100000"
                    value={item.quantity}
                    aria-label={`Ingredient ${index + 1} quantity`}
                    onChange={(event) =>
                      setItem(
                        "ingredients",
                        index,
                        "quantity",
                        event.target.value,
                      )
                    }
                    placeholder="2"
                    className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 max-[580px]:px-2 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
                  />
                </label>
                <label className="block mb-2.5 text-xs font-[550] leading-[1.6]">
                  <span className="field-hint text-muted m-0 text-[10px] font-normal">Unit</span>
                  <input
                    value={item.unit}
                    aria-label={`Ingredient ${index + 1} unit`}
                    onChange={(event) =>
                      setItem("ingredients", index, "unit", event.target.value)
                    }
                    placeholder="tbsp"
                    className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 max-[580px]:px-2 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
                  />
                </label>
                <label className="block mb-2.5 text-xs font-[550] leading-[1.6]">
                  <span className="field-hint text-muted m-0 text-[10px] font-normal">Ingredient</span>
                  <input
                    required
                    value={item.name}
                    aria-label={`Ingredient ${index + 1} name`}
                    onChange={(event) =>
                      setItem("ingredients", index, "name", event.target.value)
                    }
                    placeholder="Olive oil"
                    className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 max-[580px]:px-2 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
                  />
                </label>
                <IconButton
                  size="sm"
                  disabled={draft.ingredients.length === 1}
                  aria-label={`Remove ingredient ${index + 1}`}
                  onClick={() =>
                    set(
                      "ingredients",
                      draft.ingredients.filter((_, at) => at !== index),
                    )
                  }
                  className="w-8 h-8 max-[580px]:w-[30px] max-[370px]:w-7 mt-[21px] text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} />
                </IconButton>
                <label className="col-span-3 mb-2">
                  <span className="sr-only">
                    Ingredient {index + 1} preparation note
                  </span>
                  <input
                    value={item.note || ""}
                    aria-label={`Ingredient ${index + 1} preparation note`}
                    placeholder="Preparation note (optional)"
                    onChange={(event) =>
                      setItem("ingredients", index, "note", event.target.value)
                    }
                    className="m-0 min-h-[40px] w-full rounded-[4px] border border-[#e1e6dd] bg-transparent px-3 py-1.5 text-sm text-ink transition-colors placeholder:text-[#929b90] focus:border-ink/50 focus:outline-none max-[580px]:text-base"
                  />
                </label>
                <label className="col-span-3 mb-2">
                  <span className="sr-only">Ingredient {index + 1} group</span>
                  <input
                    value={item.group || ""}
                    aria-label={`Ingredient ${index + 1} group`}
                    placeholder="Ingredient group (optional)"
                    onChange={(event) =>
                      setItem("ingredients", index, "group", event.target.value)
                    }
                    className="m-0 min-h-[40px] w-full rounded-[4px] border border-[#e1e6dd] bg-transparent px-3 py-1.5 text-sm text-ink transition-colors placeholder:text-[#929b90] focus:border-ink/50 focus:outline-none max-[580px]:text-base"
                  />
                </label>
              </div>
            ))}
            <TextButton
              type="button"
              className="mt-1"
              onClick={() =>
                set("ingredients", [...draft.ingredients, blankIngredient()])
              }
            >
              <Plus size={16} />
              Add ingredient
            </TextButton>
          </fieldset>
          <fieldset className="border-0 border-t border-line min-w-0 mt-1.5 mb-[27px] pt-[26px] pb-1.5">
            <legend className="font-serif font-normal text-2xl pr-[15px] max-[580px]:text-[25px]">Method</legend>
            {draft.steps.map((step, index) => (
              <div className="step-fields mb-[22px]" key={index}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="eyebrow block text-[10px] font-semibold tracking-[0.08em] uppercase text-muted">
                    Step {index + 1}
                  </span>
                  <IconButton
                    size="sm"
                    disabled={draft.steps.length === 1}
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() =>
                      set(
                        "steps",
                        draft.steps.filter((_, at) => at !== index),
                      )
                    }
                    className="w-8 h-8 text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
                <label className="sr-only" htmlFor={`step-title-${index}`}>
                  Step {index + 1} title
                </label>
                <input
                  id={`step-title-${index}`}
                  value={step.title}
                  onChange={(event) =>
                    setItem("steps", index, "title", event.target.value)
                  }
                  placeholder="A short heading (optional)"
                  className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-0 mb-2 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
                />
                <label
                  className="sr-only"
                  htmlFor={`step-instruction-${index}`}
                >
                  Step {index + 1} instructions
                </label>
                <textarea
                  id={`step-instruction-${index}`}
                  required
                  rows={3}
                  value={step.instruction}
                  onChange={(event) =>
                    setItem("steps", index, "instruction", event.target.value)
                  }
                  placeholder="What happens next?"
                  className="w-full min-h-[80px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] leading-[1.6] resize-y focus:outline-none focus:border-ink/50 transition-colors"
                />
              </div>
            ))}
            <TextButton
              type="button"
              className="mt-1"
              onClick={() => set("steps", [...draft.steps, blankStep()])}
            >
              <Plus size={16} />
              Add step
            </TextButton>
          </fieldset>
          <details className="editor-extras border-t border-line pt-5">
            <summary className="cursor-pointer min-h-[38px] max-[580px]:min-h-[48px] max-[580px]:leading-[1.7] text-[13px] font-[550] text-ink select-none">
              Notes, substitutions & search keywords
            </summary>
            <label className="block mt-[15px] mb-[19px] text-xs font-[550] leading-[1.6]">
              Kitchen notes <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">one per line</span>
              <textarea
                value={draft.notes.join("\n")}
                onChange={(event) =>
                  set("notes", event.target.value.split("\n"))
                }
                rows={3}
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] leading-[1.6] resize-y focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Substitutions <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">one per line</span>
              <textarea
                value={draft.substitutions.join("\n")}
                onChange={(event) =>
                  set("substitutions", event.target.value.split("\n"))
                }
                rows={2}
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] leading-[1.6] resize-y focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Equipment <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">comma-separated</span>
              <input
                value={draft.equipment.join(",")}
                onChange={(event) =>
                  set("equipment", event.target.value.split(","))
                }
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Search keywords{" "}
              <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">comma-separated</span>
              <input
                value={draft.keywords.join(",")}
                onChange={(event) =>
                  set("keywords", event.target.value.split(","))
                }
                placeholder="beef, rib eye, skillet"
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
            <label className="block mb-[19px] text-xs font-[550] leading-[1.6]">
              Source video <span className="field-hint text-muted ml-0.5 text-[10px] font-normal">optional</span>
              <input
                type="url"
                inputMode="url"
                value={draft.sourceVideo || ""}
                onChange={(event) => set("sourceVideo", event.target.value)}
                placeholder="Instagram, TikTok, or YouTube URL"
                className="w-full min-h-[44px] text-ink bg-white border border-[#cfd8cb] rounded-[4px] mt-1.5 px-3 py-2.5 text-sm max-[580px]:text-base placeholder:text-[#929b90] focus:outline-none focus:border-ink/50 transition-colors"
              />
            </label>
          </details>
          {isLocal && (
            <div className="delete-recipe mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#ecd3ce] pt-5 text-xs">
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#a5382b]">Danger zone</span>
                <p className="m-0 text-[13px] text-muted">Remove this recipe permanently.</p>
              </div>
              {confirmDelete ? (
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <span className="text-ink">
                    {isCloud
                      ? "Delete this recipe from your cookbook?"
                      : "Delete this browser-saved recipe?"}
                  </span>
                  <TextButton
                    type="button"
                    className="text-button danger text-[#a5382b] hover:text-[#8a2e23] font-semibold"
                    onClick={() => onDelete(recipe.id)}
                  >
                    Yes, delete
                  </TextButton>
                  <TextButton
                    type="button"
                    className="text-button text-muted hover:text-ink"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep it
                  </TextButton>
                </div>
              ) : (
                <TextButton
                  type="button"
                  className="text-button danger text-[#a5382b] hover:text-[#8a2e23]"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} />
                  Delete recipe
                </TextButton>
              )}
            </div>
          )}
        </div>
        <div
          className="editor-footer z-[2] flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-8 py-[17px] max-[580px]:gap-2.5 max-[580px]:px-5 max-[580px]:py-3.5 max-[580px]:pb-[max(14px,env(safe-area-inset-bottom))]"
          role="group"
          aria-label="Editor actions"
        >
          {error && (
            <p className="form-error w-full max-w-none text-xs text-[#a5382b] m-0" role="alert">
              {error}
            </p>
          )}
          {isCloud ? (
            <p className="editor-status-cloud inline-flex items-center gap-1.5 font-[550] text-[#234d3c] max-w-none text-[11px] max-[580px]:text-[10px] m-0">
              <Cloud size={14} /> Saved to your synced cloud cookbook.
            </p>
          ) : (
            <p className="max-w-[250px] max-[580px]:max-w-[170px] max-[370px]:max-w-[140px] text-muted m-0 text-[11px] max-[580px]:text-[10px] leading-[1.6]">Saved on this browser.</p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="default"
            className="button gap-2 max-[580px]:px-3.5 max-[580px]:text-xs"
          >
            <Save size={17} />
            Save recipe
          </Button>
        </div>
      </form>
    </dialog>
  );
}
