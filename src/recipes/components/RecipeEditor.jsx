import { useEffect, useRef, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { ARTWORKS, validateRecipe } from "../library";

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
}) {
  const dialog = useRef(null);
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
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  const submit = (event) => {
    event.preventDefault();
    try {
      const saved = validateRecipe({
        ...draft,
        id: isLocal ? recipe.id : `recipe-${crypto.randomUUID()}`,
        example: false,
        servings: Number(draft.servings),
        prepMinutes: Number(draft.prepMinutes),
        cookMinutes: Number(draft.cookMinutes),
        restMinutes: Number(draft.restMinutes),
        ingredients: draft.ingredients.map((item) => ({
          ...item,
          quantity: item.quantity === "" ? null : Number(item.quantity),
        })),
      });
      const problem = onSave(saved);
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
      onCancel={onClose}
    >
      <form onSubmit={submit}>
        <div className="editor-header">
          <div>
            <span className="eyebrow">From your kitchen</span>
            <h2 id="editor-title">
              {recipe ? "Make it yours." : "A new keeper."}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close recipe editor"
          >
            <X size={21} />
          </button>
        </div>
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
                  <span>Delete this browser-saved recipe?</span>
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
          <p>Saved on this browser. Export a backup to keep a copy.</p>
          <button className="button" type="submit">
            <Save size={17} />
            Save recipe
          </button>
        </div>
      </form>
    </dialog>
  );
}
