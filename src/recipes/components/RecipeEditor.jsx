import { useEffect, useRef, useState } from "react";
import {
  Cloud,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ARTWORKS, validateRecipe } from "../library";
import { uploadRecipeCover } from "../cloud";
import {
  enhanceRecipeWithGemini,
  generateRecipeCoverWithGemini,
} from "../ai";
import RecipeArtwork from "./RecipeArtwork";

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

  const handleGeminiGenerate = async () => {
    if (!draft.title.trim()) {
      setCoverNotice("Please give your recipe a name first so Gemini knows what dish to photograph.");
      return;
    }
    setProcessingCover(true);
    setCoverNotice("Generating photorealistic culinary photograph with Gemini Imagen...");
    try {
      const generatedUrl = await generateRecipeCoverWithGemini(draft, {
        userId: isCloud ? userId : null,
        recipeId: draft.id || (isLocal ? recipe.id : `recipe-${crypto.randomUUID()}`),
      });
      if (generatedUrl) {
        set("artwork", generatedUrl);
        setCoverNotice(isCloud ? "Photo generated and saved to your cloud cookbook!" : "Photo generated!");
        setTimeout(() => setCoverNotice(""), 4000);
      }
    } catch (err) {
      setCoverNotice(err.message || "Failed to generate photo with Gemini Imagen.");
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
    let draftToSave = draft;

    // Run AI polish on save if title exists
    if (draft.title.trim()) {
      try {
        setPolishing(true);
        const polished = await enhanceRecipeWithGemini(draft);
        if (polished) {
          draftToSave = polished;
          setDraft({
            ...polished,
            ingredients: (polished.ingredients || []).map((item) => ({
              ...item,
              quantity: item.quantity ?? "",
            })),
          });
        }
      } catch (aiErr) {
        // Non-blocking fallback to manual draft if offline or API key absent
        console.info("AI polish skipped or failed, saving manual entry:", aiErr.message);
      } finally {
        setPolishing(false);
      }
    }

    try {
      const saved = validateRecipe({
        ...draftToSave,
        id: isLocal ? recipe.id : (draftToSave.id && draftToSave.id.startsWith("recipe-") ? draftToSave.id : `recipe-${crypto.randomUUID()}`),
        example: false,
        servings: Number(draftToSave.servings),
        prepMinutes: Number(draftToSave.prepMinutes),
        cookMinutes: Number(draftToSave.cookMinutes),
        restMinutes: Number(draftToSave.restMinutes),
        ingredients: draftToSave.ingredients.map((item) => ({
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
      className="recipe-editor"
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
      <form onSubmit={submit}>
        <div className="editor-header">
          <div>
            <span className="eyebrow">From your kitchen</span>
            <h2 id="editor-title">
              {recipe ? "Make it yours." : "A new keeper."}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              className="button ai-polish-btn"
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
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close recipe editor"
            >
              <X size={21} />
            </button>
          </div>
        </div>
        {polishNotice && (
          <div
            className="editor-cover-notice"
            style={{
              margin: "0 24px 12px 24px",
              color: "var(--green)",
              fontWeight: "600",
            }}
            role="status"
          >
            {polishNotice}
          </div>
        )}
        <div className="editor-content">
          <label>
            Recipe name
            <input
              required
              autoFocus
              value={draft.title}
              maxLength={150}
              onChange={(event) => set("title", event.target.value)}
              placeholder="What are we making?"
            />
          </label>
          <label>
            A little about it
            <textarea
              value={draft.description}
              maxLength={1000}
              onChange={(event) => set("description", event.target.value)}
              rows={2}
              placeholder="The version you always come back to."
            />
          </label>

          <div className="editor-cover-section">
            <div className="editor-cover-header">
              <span className="editor-cover-title">
                Cover photo{" "}
                <span className="field-hint">
                  optional • auto-crops symmetrically
                </span>
              </span>
              {draft.artwork && (
                <button
                  type="button"
                  className="text-button editor-cover-remove"
                  onClick={() => set("artwork", "")}
                >
                  Remove photo
                </button>
              )}
            </div>

            <div className="editor-cover-layout">
              <div className="editor-cover-preview">
                <RecipeArtwork
                  artwork={draft.artwork}
                  title={draft.title || "Recipe preview"}
                  className="editor-cover-thumb"
                />
              </div>

              <div className="editor-cover-controls">
                <div className="editor-cover-buttons">
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
                  <button
                    type="button"
                    className="button secondary editor-cover-btn"
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
                  </button>

                  <button
                    type="button"
                    className="button ai-sparkle-button editor-cover-btn"
                    onClick={handleGeminiGenerate}
                    disabled={processingCover}
                    title="Generate realistic dish photography with Gemini Imagen 3"
                  >
                    {processingCover ? (
                      <>
                        <Loader2 size={15} className="spin-icon" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        <span>Generate with Gemini</span>
                        <span className="ai-badge">Imagen 3</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="editor-cover-url-wrap">
                  <input
                    type="url"
                    value={
                      draft.artwork?.startsWith("data:") ? "" : draft.artwork
                    }
                    placeholder="Or paste an image URL (Unsplash, ImgBB, Supabase...)"
                    onChange={(event) =>
                      set("artwork", event.target.value.trim())
                    }
                  />
                </div>

                {coverNotice && (
                  <p className="editor-cover-notice" role="status">
                    {coverNotice}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Category
              <input
                required
                list="recipe-categories"
                value={draft.category}
                maxLength={150}
                onChange={(event) => set("category", event.target.value)}
              />
              <datalist id="recipe-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label>
              Tags <span className="field-hint">comma-separated</span>
              <input
                value={draft.tags.join(",")}
                onChange={(event) => set("tags", event.target.value.split(","))}
                placeholder="Quick meals, Chicken"
              />
            </label>
            <label>
              Prep time <span className="field-hint">minutes</span>
              <input
                required
                type="number"
                min="0"
                max="10080"
                value={draft.prepMinutes}
                onChange={(event) => set("prepMinutes", event.target.value)}
              />
            </label>
            <label>
              Cook time <span className="field-hint">minutes</span>
              <input
                required
                type="number"
                min="0"
                max="10080"
                value={draft.cookMinutes}
                onChange={(event) => set("cookMinutes", event.target.value)}
              />
            </label>
            <label>
              Rest time <span className="field-hint">minutes</span>
              <input
                required
                type="number"
                min="0"
                max="10080"
                value={draft.restMinutes}
                onChange={(event) => set("restMinutes", event.target.value)}
              />
            </label>
            <label>
              Servings
              <input
                required
                type="number"
                min="1"
                max="100"
                value={draft.servings}
                onChange={(event) => set("servings", event.target.value)}
              />
            </label>
            <label>
              Illustration
              <select
                value={draft.artwork}
                onChange={(event) => set("artwork", event.target.value)}
              >
                <option value="">Lettering</option>
                {ARTWORKS.map((artwork) => (
                  <option key={artwork} value={artwork}>
                    {artwork[0].toUpperCase() + artwork.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cuisine
              <input
                value={draft.cuisine}
                onChange={(event) => set("cuisine", event.target.value)}
                placeholder="Italian, Japanese-inspired..."
              />
            </label>
            <label>
              Cooking method
              <input
                value={draft.method}
                onChange={(event) => set("method", event.target.value)}
                placeholder="Air fryer, stir fry, no cook..."
              />
            </label>
          </div>
          <fieldset>
            <legend>Ingredients</legend>
            {draft.ingredients.map((item, index) => (
              <div className="ingredient-fields" key={index}>
                <label>
                  <span className="field-hint">Amount</span>
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
                  />
                </label>
                <label>
                  <span className="field-hint">Unit</span>
                  <input
                    value={item.unit}
                    aria-label={`Ingredient ${index + 1} unit`}
                    onChange={(event) =>
                      setItem("ingredients", index, "unit", event.target.value)
                    }
                    placeholder="tbsp"
                  />
                </label>
                <label>
                  <span className="field-hint">Ingredient</span>
                  <input
                    required
                    value={item.name}
                    aria-label={`Ingredient ${index + 1} name`}
                    onChange={(event) =>
                      setItem("ingredients", index, "name", event.target.value)
                    }
                    placeholder="Olive oil"
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  disabled={draft.ingredients.length === 1}
                  aria-label={`Remove ingredient ${index + 1}`}
                  onClick={() =>
                    set(
                      "ingredients",
                      draft.ingredients.filter((_, at) => at !== index),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
                <label className="ingredient-note-field">
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
                  />
                </label>
                <label className="ingredient-group-field">
                  <span className="sr-only">Ingredient {index + 1} group</span>
                  <input
                    value={item.group || ""}
                    aria-label={`Ingredient ${index + 1} group`}
                    placeholder="Ingredient group (optional)"
                    onChange={(event) =>
                      setItem("ingredients", index, "group", event.target.value)
                    }
                  />
                </label>
              </div>
            ))}
            <button
              className="text-button"
              type="button"
              onClick={() =>
                set("ingredients", [...draft.ingredients, blankIngredient()])
              }
            >
              <Plus size={16} />
              Add ingredient
            </button>
          </fieldset>
          <fieldset>
            <legend>Method</legend>
            {draft.steps.map((step, index) => (
              <div className="step-fields" key={index}>
                <div>
                  <span className="eyebrow">Step {index + 1}</span>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={draft.steps.length === 1}
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() =>
                      set(
                        "steps",
                        draft.steps.filter((_, at) => at !== index),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
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
                />
              </div>
            ))}
            <button
              className="text-button"
              type="button"
              onClick={() => set("steps", [...draft.steps, blankStep()])}
            >
              <Plus size={16} />
              Add step
            </button>
          </fieldset>
          <details className="editor-extras">
            <summary>Notes, substitutions & search keywords</summary>
            <label>
              Kitchen notes <span className="field-hint">one per line</span>
              <textarea
                value={draft.notes.join("\n")}
                onChange={(event) =>
                  set("notes", event.target.value.split("\n"))
                }
                rows={3}
              />
            </label>
            <label>
              Substitutions <span className="field-hint">one per line</span>
              <textarea
                value={draft.substitutions.join("\n")}
                onChange={(event) =>
                  set("substitutions", event.target.value.split("\n"))
                }
                rows={2}
              />
            </label>
            <label>
              Equipment <span className="field-hint">comma-separated</span>
              <input
                value={draft.equipment.join(",")}
                onChange={(event) =>
                  set("equipment", event.target.value.split(","))
                }
              />
            </label>
            <label>
              Search keywords{" "}
              <span className="field-hint">comma-separated</span>
              <input
                value={draft.keywords.join(",")}
                onChange={(event) =>
                  set("keywords", event.target.value.split(","))
                }
                placeholder="beef, rib eye, skillet"
              />
            </label>
            <label>
              Source video <span className="field-hint">optional</span>
              <input
                type="url"
                inputMode="url"
                value={draft.sourceVideo || ""}
                onChange={(event) => set("sourceVideo", event.target.value)}
                placeholder="Instagram, TikTok, or YouTube URL"
              />
            </label>
          </details>
          {isLocal && (
            <div className="delete-recipe">
              {confirmDelete ? (
                <>
                  <span>
                    {isCloud
                      ? "Delete this recipe from your cookbook?"
                      : "Delete this browser-saved recipe?"}
                  </span>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => onDelete(recipe.id)}
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Keep it
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} />
                  Delete recipe
                </button>
              )}
            </div>
          )}
        </div>
        <div className="editor-footer">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {isCloud ? (
            <p className="editor-status-cloud">
              <Cloud size={14} /> Saved to your synced cloud cookbook.
            </p>
          ) : (
            <p>Saved on this browser. Export a backup to keep a copy.</p>
          )}
          <button className="button" type="submit">
            <Save size={17} />
            Save recipe
          </button>
        </div>
      </form>
    </dialog>
  );
}
