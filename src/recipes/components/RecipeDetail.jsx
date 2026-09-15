import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Clock3,
  CookingPot,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sun,
  UsersRound,
} from "lucide-react";
import { groupIngredients, totalMinutes } from "../library";
import { convertMeasurement } from "../units";
import RecipeArtwork from "./RecipeArtwork";
import RecipeVideo from "./RecipeVideo";

function IngredientList({
  ingredients,
  checkedIngredients,
  multiplier,
  unitSystem = "original",
  onToggle,
}) {
  return (
    <ul className="ingredient-list">
      {ingredients.map((ingredient) => {
        const measurement = convertMeasurement(
          ingredient.quantity,
          ingredient.unit,
          unitSystem,
          multiplier,
        );
        return (
          <li key={ingredient.id}>
            <label
              className={
                checkedIngredients.includes(ingredient.id) ? "checked" : ""
              }
            >
              <input
                type="checkbox"
                checked={checkedIngredients.includes(ingredient.id)}
                onChange={() => onToggle(ingredient.id)}
              />
              <span className="check-square">
                <Check size={13} />
              </span>
              <span>
                {measurement.formatted ? (
                  <strong>{measurement.formatted}</strong>
                ) : null}{" "}
                {ingredient.name}
                {ingredient.note && <small>{ingredient.note}</small>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function useKeepAwake() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let lock;
    const request = async () => {
      if (document.visibilityState !== "visible") return;
      if (lock && !lock.released) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (!active) {
          await next.release();
          return;
        }
        lock = next;
        next.addEventListener("release", () => {
          if (active && document.visibilityState === "visible")
            setEnabled(false);
        });
      } catch {
        if (active) {
          setEnabled(false);
          setError(
            "Your device couldn't keep the screen awake. Check its auto-lock setting instead.",
          );
        }
      }
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      active = false;
      lock?.release();
      document.removeEventListener("visibilitychange", request);
    };
  }, [enabled]);
  return {
    supported: "wakeLock" in navigator,
    toggle: () => {
      setError("");
      setEnabled(!enabled);
    },
    error,
  };
}

export default function RecipeDetail({
  recipe,
  favorite,
  onFavorite,
  progress = {},
  onProgress,
  onEdit,
  isLocal,
  inGroceries = false,
  onToggleGroceries,
}) {
  const [servings, setServings] = useState(recipe.servings);
  const [unitSystem, setUnitSystem] = useState("original");
  useEffect(() => setServings(recipe.servings), [recipe.servings]);
  const awake = useKeepAwake();
  const titleRef = useRef(null);
  const jumpTo = (event, section) => {
    event.preventDefault();
    const target = document.getElementById(section);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const checkedIngredients = Array.isArray(progress.ingredients)
    ? progress.ingredients
    : [];
  const checkedSteps = Array.isArray(progress.steps) ? progress.steps : [];
  const totalItems = recipe.ingredients.length + recipe.steps.length;
  const completedIngredients = checkedIngredients.filter((id) =>
    recipe.ingredients.some((item) => item.id === id),
  ).length;
  const completedSteps = checkedSteps.filter((id) =>
    recipe.steps.some((step) => step.id === id),
  ).length;
  const completedItems = completedIngredients + completedSteps;
  const progressPercent =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const ingredientGroups = groupIngredients(recipe.ingredients);
  const toggle = (kind, id) => {
    const values = kind === "ingredients" ? checkedIngredients : checkedSteps;
    onProgress({
      ...progress,
      [kind]: values.includes(id)
        ? values.filter((value) => value !== id)
        : [...values, id],
    });
  };
  useEffect(() => {
    window.scrollTo(0, 0);
    titleRef.current?.focus({ preventScroll: true });
  }, [recipe.id]);
  return (
    <main id="recipe-main" className="recipe-detail" tabIndex={-1}>
      <div className="detail-toolbar">
        <a className="back-link" href="#/">
          <ArrowLeft size={17} />
          Back to the shelf
        </a>
        <div className="detail-toolbar-actions">
          {onToggleGroceries && (
            <button
              type="button"
              className={`text-button grocery-toggle-btn ${inGroceries ? "is-active" : ""}`}
              onClick={() => onToggleGroceries(recipe.id, servings)}
              aria-pressed={inGroceries}
            >
              <ShoppingBag size={15} />
              <span>{inGroceries ? "In Groceries" : "Add to Groceries"}</span>
            </button>
          )}
          <button className="text-button" onClick={() => onEdit(recipe)}>
            <Pencil size={15} />
            {isLocal ? "Edit recipe" : "Make it your own"}
          </button>
        </div>
      </div>
      <header className="detail-header">
        <div className="detail-heading">
          <div className="eyebrow">
            {recipe.category}
            {recipe.cuisine && (
              <>
                <span className="dot-separator" />
                {recipe.cuisine}
              </>
            )}
          </div>
          <h1 ref={titleRef} tabIndex={-1}>
            {recipe.title}
          </h1>
          <p className="detail-description">{recipe.description}</p>
          <div className="recipe-tags">
            {recipe.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="detail-stats">
            <div>
              <Clock3 size={18} />
              <span>
                Prep<strong>{recipe.prepMinutes} min</strong>
              </span>
            </div>
            <div>
              <CookingPot size={18} />
              <span>
                Cook<strong>{recipe.cookMinutes} min</strong>
              </span>
            </div>
            <div>
              <Clock3 size={18} />
              <span>
                Total
                <strong>{totalMinutes(recipe)} min</strong>
              </span>
            </div>
            <div>
              <UsersRound size={18} />
              <span>
                Serves<strong>{recipe.servings}</strong>
              </span>
            </div>
          </div>
          {recipe.restMinutes > 0 && (
            <p className="timing-note">
              Includes {recipe.restMinutes} min resting
            </p>
          )}
        </div>
        <div className="detail-illustration">
          <RecipeArtwork artwork={recipe.artwork} title={recipe.title} />
          <button
            className={`icon-button detail-bookmark ${favorite ? "is-saved" : ""}`}
            onClick={() => onFavorite(recipe.id)}
            aria-label={
              favorite ? "Remove from favorites" : "Save to favorites"
            }
            aria-pressed={favorite}
            title={favorite ? "Remove from favorites" : "Save to favorites"}
          >
            <Bookmark size={20} fill={favorite ? "currentColor" : "none"} />
          </button>
          <span className="detail-art-caption">
            {recipe.example ? "From the starter collection" : "From my kitchen"}
          </span>
        </div>
      </header>
      <div className="cooking-bar">
        <nav aria-label="Recipe sections">
          <a
            href="#ingredients"
            onClick={(event) => jumpTo(event, "ingredients")}
          >
            Ingredients
          </a>
          <a href="#method" onClick={(event) => jumpTo(event, "method")}>
            Method
          </a>
          {recipe.sourceVideo && (
            <a href="#video" onClick={(event) => jumpTo(event, "video")}>
              Video
            </a>
          )}
        </nav>
        <div
          className="cooking-progress"
          aria-label="Cooking checklist progress"
        >
          <div className="cooking-progress__bar">
            <div
              className="cooking-progress__fill"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="cooking-progress__label">
            {progressPercent === 100
              ? "Ready to serve!"
              : `${progressPercent}% (${completedIngredients}/${recipe.ingredients.length} prepped · ${completedSteps}/${recipe.steps.length} cooked)`}
          </span>
        </div>
        {awake.supported && (
          <button
            className={`awake-toggle ${awake.enabled ? "active" : ""}`}
            aria-pressed={awake.enabled}
            onClick={awake.toggle}
          >
            <Sun size={17} />
            <span>
              {awake.enabled ? "Screen stays awake" : "Keep screen awake"}
            </span>
            <span className="switch-track" />
          </button>
        )}
      </div>
      {awake.error && (
        <p className="inline-notice" role="status">
          {awake.error}
        </p>
      )}
      <div className="cooking-layout">
        <section className="ingredients-panel" id="ingredients" tabIndex={-1}>
          <div className="section-heading">
            <div className="section-heading-text">
              <h2>Ingredients</h2>
              <span>{recipe.ingredients.length} items</span>
            </div>
            {onToggleGroceries && (
              <button
                type="button"
                className={`button button--light button--compact grocery-add-pill ${inGroceries ? "is-active" : ""}`}
                onClick={() => onToggleGroceries(recipe.id, servings)}
                aria-pressed={inGroceries}
              >
                <ShoppingBag size={14} />
                <span>{inGroceries ? "In Groceries" : "Add to Groceries"}</span>
              </button>
            )}
          </div>
          <div className="servings-control">
            <div className="servings-stepper">
              <span>Servings</span>
              <div>
                <button
                  className="icon-button"
                  onClick={() => setServings(Math.max(1, servings - 1))}
                  disabled={servings <= 1}
                  aria-label="Fewer servings"
                >
                  <Minus size={15} />
                </button>
                <output aria-label="Adjusted servings">{servings}</output>
                <button
                  className="icon-button"
                  onClick={() => setServings(Math.min(100, servings + 1))}
                  disabled={servings >= 100}
                  aria-label="More servings"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div
              className="unit-toggle"
              role="group"
              aria-label="Measurement units"
            >
              <button
                type="button"
                className={`unit-toggle-btn ${unitSystem === "original" ? "active" : ""}`}
                onClick={() => setUnitSystem("original")}
                aria-pressed={unitSystem === "original"}
              >
                Original
              </button>
              <button
                type="button"
                className={`unit-toggle-btn ${unitSystem === "us" ? "active" : ""}`}
                onClick={() => setUnitSystem("us")}
                aria-pressed={unitSystem === "us"}
              >
                US
              </button>
              <button
                type="button"
                className={`unit-toggle-btn ${unitSystem === "metric" ? "active" : ""}`}
                onClick={() => setUnitSystem("metric")}
                aria-pressed={unitSystem === "metric"}
              >
                Metric
              </button>
            </div>
          </div>
          <div className="ingredient-groups">
            {ingredientGroups.map(([group, ingredients]) => (
              <section
                className="ingredient-group"
                key={group || "ingredients"}
              >
                {group && <h3>{group}</h3>}
                <IngredientList
                  ingredients={ingredients}
                  checkedIngredients={checkedIngredients}
                  multiplier={servings / recipe.servings}
                  unitSystem={unitSystem}
                  onToggle={(id) => toggle("ingredients", id)}
                />
              </section>
            ))}
          </div>
          {recipe.equipment.length > 0 && (
            <div className="equipment">
              <h3 className="eyebrow">On the counter</h3>
              <p>{recipe.equipment.join(" / ")}</p>
            </div>
          )}
        </section>
        <section className="method-panel" id="method" tabIndex={-1}>
          <div className="section-heading">
            <h2>Let's make it.</h2>
            <span aria-live="polite">
              {
                checkedSteps.filter((id) =>
                  recipe.steps.some((step) => step.id === id),
                ).length
              }{" "}
              / {recipe.steps.length} done
            </span>
          </div>
          <ol className="step-list">
            {recipe.steps.map((step, index) => (
              <li
                key={step.id}
                className={checkedSteps.includes(step.id) ? "completed" : ""}
              >
                <button
                  className="step-number"
                  aria-label={`Mark step ${index + 1} ${checkedSteps.includes(step.id) ? "incomplete" : "complete"}`}
                  aria-pressed={checkedSteps.includes(step.id)}
                  onClick={() => toggle("steps", step.id)}
                >
                  {checkedSteps.includes(step.id) ? (
                    <Check size={20} />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </button>
                <div>
                  {step.title && <h3>{step.title}</h3>}
                  <p>{step.instruction}</p>
                </div>
              </li>
            ))}
          </ol>
          {checkedSteps.length === recipe.steps.length && (
            <p className="done-note">
              <Check size={19} />
              All done. Enjoy every bite.
            </p>
          )}
          {(checkedSteps.length > 0 || checkedIngredients.length > 0) && (
            <button
              className="text-button reset-progress"
              onClick={() => onProgress({ ingredients: [], steps: [] })}
            >
              <RotateCcw size={14} />
              Reset cooking checklist
            </button>
          )}
          {(recipe.notes.length > 0 || recipe.substitutions.length > 0) && (
            <aside className="kitchen-notes">
              <span className="eyebrow">The small things</span>
              <h2>Kitchen notes</h2>
              {recipe.notes.map((note, index) => (
                <p key={index}>{note}</p>
              ))}
              {recipe.substitutions.length > 0 && (
                <>
                  <h3>Make it work with what you have</h3>
                  {recipe.substitutions.map((note, index) => (
                    <p key={index}>{note}</p>
                  ))}
                </>
              )}
            </aside>
          )}
          <RecipeVideo
            sourceVideo={recipe.sourceVideo}
            recipeTitle={recipe.title}
          />
        </section>
      </div>
      <div className="detail-bottom">
        <a className="back-link" href="#/">
          <ArrowLeft size={17} />
          Back to the shelf
        </a>
        <span className="eyebrow">A recipe worth keeping.</span>
      </div>
    </main>
  );
}
