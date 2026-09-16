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
import { IconButton } from "@/components/ui/IconButton";
import { TextButton } from "@/components/ui/TextButton";
import { cn } from "@/lib/utils";

function IngredientList({
  ingredients,
  checkedIngredients,
  multiplier,
  unitSystem = "original",
  onToggle,
}) {
  return (
    <ul className="ingredient-list m-0 p-0 list-none">
      {ingredients.map((ingredient) => {
        const measurement = convertMeasurement(
          ingredient.quantity,
          ingredient.unit,
          unitSystem,
          multiplier,
        );
        const isChecked = checkedIngredients.includes(ingredient.id);
        return (
          <li key={ingredient.id}>
            <label
              className={cn(
                "flex items-start gap-[13px] max-[580px]:gap-3.5 min-h-[55px] max-[580px]:min-h-[59px] py-4 border-b border-[#e6ebe1] text-sm max-[800px]:text-[13px] max-[580px]:text-base leading-[1.6] cursor-pointer relative select-none",
                isChecked && "checked"
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(ingredient.id)}
                className="opacity-0 w-[21px] h-[21px] m-0 absolute top-[17px] left-0 peer cursor-pointer"
              />
              <span
                className={cn(
                  "check-square shrink-0 flex items-center justify-center w-[19px] h-[19px] max-[580px]:w-5 max-[580px]:h-5 mt-0.5 max-[580px]:mt-1 rounded-[3px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-terracotta peer-focus-visible:outline-offset-[3px]",
                  isChecked
                    ? "bg-[#234d3c] border-[#234d3c] text-white"
                    : "bg-paper border-[#a8b6a3] text-transparent"
                )}
              >
                <Check size={13} />
              </span>
              <span className={cn("flex-1", isChecked && "text-[#7b8579] line-through")}>
                {measurement.formatted ? (
                  <strong className="font-semibold">{measurement.formatted}</strong>
                ) : null}{" "}
                {ingredient.name}
                {ingredient.note && (
                  <small className="text-muted block mt-0.5 text-xs max-[580px]:text-[13px] no-underline">
                    {ingredient.note}
                  </small>
                )}
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
    <main
      id="recipe-main"
      className="recipe-detail mx-auto pb-24 w-[calc(100%-36px)] min-[581px]:w-[calc(100%-48px)] min-[801px]:w-[calc(100%-72px)] min-[1151px]:w-[min(1312px,calc(100%-48px))] min-[1500px]:w-[min(1360px,calc(100%-160px))] outline-none"
      tabIndex={-1}
    >
      <div className="detail-toolbar flex items-center justify-between gap-5 max-[580px]:gap-2.5 mt-[25px] max-[580px]:mt-[15px] mb-[34px] max-[800px]:mb-6 max-[580px]:mb-5">
        <a
          className="back-link inline-flex items-center gap-[9px] min-h-[44px] text-[13px] max-[580px]:text-xs text-muted hover:text-terracotta transition-colors duration-150 select-none"
          href="#/"
        >
          <ArrowLeft size={17} />
          Back to the shelf
        </a>
        <div className="detail-toolbar-actions flex items-center gap-3">
          <TextButton
            className="text-muted hover:text-ink text-xs max-[580px]:text-[11px] gap-1.5 max-[580px]:gap-1.5 min-h-[44px]"
            onClick={() => onEdit(recipe)}
          >
            <Pencil size={15} />
            {isLocal ? "Edit recipe" : "Make it your own"}
          </TextButton>
        </div>
      </div>
      <header className="detail-header grid grid-cols-[1.12fr_1fr] max-[800px]:grid-cols-[1.1fr_1fr] max-[580px]:flex max-[580px]:flex-col items-center max-[800px]:items-start gap-[72px] max-[1150px]:gap-[38px] max-[800px]:gap-[25px] max-[580px]:gap-6 pb-[42px] max-[580px]:pb-[25px]">
        <div className="detail-heading max-[580px]:order-1 max-[580px]:w-full">
          <div className="eyebrow flex items-center gap-2.5 text-[10px] max-[580px]:text-[9px] font-semibold tracking-[0.08em] uppercase text-muted">
            {recipe.category}
            {recipe.cuisine && (
              <>
                <span className="dot-separator w-[3px] h-[3px] rounded-full bg-[#94a28e] inline-block" />
                {recipe.cuisine}
              </>
            )}
          </div>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className="font-serif font-normal text-[52px] leading-[1.08] max-[1150px]:text-[43px] max-[800px]:text-[36px] max-[580px]:text-[39px] max-[580px]:leading-[1.12] max-[370px]:text-[34px] break-words outline-none max-w-[530px] max-[580px]:max-w-full my-[21px] max-[580px]:mt-[13px] mb-[23px] max-[580px]:mb-[17px] text-ink"
          >
            {recipe.title}
          </h1>
          <p className="detail-description text-muted max-w-[460px] mb-[23px] max-[580px]:mb-[18px] text-[15px] max-[800px]:text-[13px] max-[580px]:text-[14px] leading-[1.8] max-[580px]:leading-[1.75]">
            {recipe.description}
          </p>
          <div className="recipe-tags flex flex-wrap gap-2 max-[580px]:gap-1.5 mb-[31px] max-[580px]:mb-[21px]">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="text-[#586d58] bg-[#e9eee5] rounded-[3px] px-[9px] py-[5px] text-[10px]"
              >
                {tag}
              </span>
            ))}
          </div>
          <div className="detail-stats border-t border-line grid grid-cols-4 max-[800px]:grid-cols-4 gap-2.5 pt-[22px] max-[580px]:pt-[18px]">
            <div className="text-muted flex items-center gap-[9px] max-[1150px]:gap-1.5 max-[580px]:gap-2">
              <Clock3
                size={18}
                className="w-[18px] h-[18px] max-[1150px]:w-[15px] max-[1150px]:h-[15px] max-[800px]:hidden max-[580px]:block max-[580px]:w-4 max-[580px]:h-4 max-[370px]:!hidden shrink-0"
              />
              <span className="flex flex-col gap-[5px] text-[10px]">
                Prep<strong className="text-ink text-[13px] max-[1150px]:text-xs max-[580px]:text-[13px] leading-[1.5] font-[550]">{recipe.prepMinutes} min</strong>
              </span>
            </div>
            <div className="text-muted flex items-center gap-[9px] max-[1150px]:gap-1.5 max-[580px]:gap-2">
              <CookingPot
                size={18}
                className="w-[18px] h-[18px] max-[1150px]:w-[15px] max-[1150px]:h-[15px] max-[800px]:hidden max-[580px]:block max-[580px]:w-4 max-[580px]:h-4 max-[370px]:!hidden shrink-0"
              />
              <span className="flex flex-col gap-[5px] text-[10px]">
                Cook<strong className="text-ink text-[13px] max-[1150px]:text-xs max-[580px]:text-[13px] leading-[1.5] font-[550]">{recipe.cookMinutes} min</strong>
              </span>
            </div>
            <div className="text-muted flex items-center gap-[9px] max-[1150px]:gap-1.5 max-[580px]:gap-2">
              <Clock3
                size={18}
                className="w-[18px] h-[18px] max-[1150px]:w-[15px] max-[1150px]:h-[15px] max-[800px]:hidden max-[580px]:block max-[580px]:w-4 max-[580px]:h-4 max-[370px]:!hidden shrink-0"
              />
              <span className="flex flex-col gap-[5px] text-[10px]">
                Total
                <strong className="text-ink text-[13px] max-[1150px]:text-xs max-[580px]:text-[13px] leading-[1.5] font-[550]">{totalMinutes(recipe)} min</strong>
              </span>
            </div>
            <div className="text-muted flex items-center gap-[9px] max-[1150px]:gap-1.5 max-[580px]:gap-2">
              <UsersRound
                size={18}
                className="w-[18px] h-[18px] max-[1150px]:w-[15px] max-[1150px]:h-[15px] max-[800px]:hidden max-[580px]:block max-[580px]:w-4 max-[580px]:h-4 max-[370px]:!hidden shrink-0"
              />
              <span className="flex flex-col gap-[5px] text-[10px]">
                Serves<strong className="text-ink text-[13px] max-[1150px]:text-xs max-[580px]:text-[13px] leading-[1.5] font-[550]">{recipe.servings}</strong>
              </span>
            </div>
          </div>
          {recipe.restMinutes > 0 && (
            <p className="timing-note text-muted text-[11px] mt-2.5">
              Includes {recipe.restMinutes} min resting
            </p>
          )}
        </div>
        <div className="detail-illustration relative min-w-0 max-[580px]:order-0 max-[580px]:w-full">
          <RecipeArtwork
            artwork={recipe.artwork}
            title={recipe.title}
            className="w-full aspect-[1.25] max-[800px]:aspect-square max-[580px]:aspect-[1.8] rounded-md overflow-hidden"
          />
          <button
            className={cn(
              "icon-button detail-bookmark absolute top-[18px] right-[18px] max-[580px]:top-3 max-[580px]:right-3 w-10 h-10 max-[580px]:w-[38px] max-[580px]:h-[38px] rounded-full flex items-center justify-center p-0 border-0 cursor-pointer shadow-md backdrop-blur-md transition-all duration-150 select-none",
              favorite
                ? "is-saved bg-ink text-white"
                : "bg-white/90 text-ink hover:bg-white hover:scale-105"
            )}
            onClick={() => onFavorite(recipe.id)}
            aria-label={
              favorite ? "Remove from favorites" : "Save to favorites"
            }
            aria-pressed={favorite}
            title={favorite ? "Remove from favorites" : "Save to favorites"}
          >
            <Bookmark size={20} fill={favorite ? "currentColor" : "none"} />
          </button>
          <span className="detail-art-caption text-muted font-serif italic text-[12px] [line-height:normal] text-right mt-2.5 block max-[580px]:hidden">
            {recipe.example ? "From the starter collection" : "From my kitchen"}
          </span>
        </div>
      </header>
      <div className="cooking-bar sticky top-0 z-20 bg-paper border-y border-line flex max-[640px]:grid max-[640px]:grid-cols-[minmax(0,1fr)_auto] max-[640px]:gap-x-2.5 items-center justify-between gap-3 max-[800px]:gap-2 min-h-[65px] max-[580px]:min-h-[59px] px-0">
        <nav aria-label="Recipe sections" className="flex items-center gap-7 max-[580px]:gap-5 max-[640px]:col-start-1 max-[640px]:row-start-1 max-[640px]:min-w-0">
          <a
            href="#ingredients"
            onClick={(event) => jumpTo(event, "ingredients")}
            className="flex items-center min-h-[54px] max-[580px]:min-h-[55px] text-[13px] max-[580px]:text-xs font-[550] text-ink hover:text-terracotta transition-colors duration-150 select-none"
          >
            Ingredients
          </a>
          <a
            href="#method"
            onClick={(event) => jumpTo(event, "method")}
            className="flex items-center min-h-[54px] max-[580px]:min-h-[55px] text-[13px] max-[580px]:text-xs font-[550] text-ink hover:text-terracotta transition-colors duration-150 select-none"
          >
            Method
          </a>
          {recipe.sourceVideo && (
            <a
              href="#video"
              onClick={(event) => jumpTo(event, "video")}
              className="flex items-center min-h-[54px] max-[580px]:min-h-[55px] text-[13px] max-[580px]:text-xs font-[550] text-ink hover:text-terracotta transition-colors duration-150 select-none"
            >
              Video
            </a>
          )}
        </nav>
        <div
          className="cooking-progress flex items-center gap-3 ml-auto max-[640px]:col-span-2 max-[640px]:row-start-2 max-[640px]:justify-between max-[640px]:w-full max-[640px]:m-0 max-[640px]:pt-2 max-[640px]:pb-[11px]"
          aria-label="Cooking checklist progress"
        >
          <div className="cooking-progress__bar bg-[#e3eae0] rounded-full w-[120px] h-[7px] overflow-hidden max-[640px]:flex-1 max-[640px]:w-auto max-[640px]:min-w-[48px] max-[640px]:max-w-[120px]">
            <div
              className="cooking-progress__fill bg-[#234d3c] rounded-full h-full transition-[width] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="cooking-progress__label text-muted whitespace-nowrap text-[11px] font-semibold max-[640px]:truncate">
            {progressPercent === 100
              ? "Ready to serve!"
              : `${progressPercent}% (${completedIngredients}/${recipe.ingredients.length} prepped · ${completedSteps}/${recipe.steps.length} cooked)`}
          </span>
        </div>
        {awake.supported && (
          <button
            className={cn(
              "awake-toggle bg-transparent border-0 flex items-center gap-[9px] max-[800px]:gap-1.5 max-[580px]:gap-1.5 max-[580px]:py-1 min-h-[44px] text-[11px] max-[580px]:text-[10px] text-ink cursor-pointer select-none max-[640px]:col-start-2 max-[640px]:row-start-1 max-[640px]:justify-self-end",
              awake.enabled && "active"
            )}
            aria-pressed={awake.enabled}
            aria-label={
              awake.enabled ? "Allow screen to sleep" : "Keep screen awake"
            }
            onClick={awake.toggle}
          >
            <Sun size={17} className="text-[#8a947e] max-[580px]:hidden" />
            <span className="max-[370px]:hidden">
              {awake.enabled ? "Screen stays awake" : "Keep screen awake"}
            </span>
            <span className="switch-track" />
          </button>
        )}
      </div>
      {awake.error && (
        <p className="inline-notice text-terracotta my-3 text-xs" role="status">
          {awake.error}
        </p>
      )}
      <div className="cooking-layout grid grid-cols-[340px_minmax(0,1fr)] max-[1150px]:grid-cols-[290px_minmax(0,1fr)] max-[800px]:grid-cols-[245px_minmax(0,1fr)] max-[580px]:block gap-[92px] max-[1150px]:gap-12 max-[800px]:gap-8 pt-[45px] max-[580px]:pt-[29px] pb-5">
        <section className="ingredients-panel scroll-mt-[90px] outline-none max-[580px]:mb-11" id="ingredients" tabIndex={-1}>
          <div className="section-heading flex items-center max-[800px]:items-start max-[580px]:!items-center max-[800px]:flex-col max-[580px]:!flex-row justify-between gap-3 max-[800px]:gap-2 mb-[27px] max-[580px]:mb-[21px]">
            <div className="section-heading-text">
              <h2 className="font-serif font-normal text-[31px] max-[800px]:text-[26px] max-[580px]:text-[30px] leading-[1.2] m-0 text-ink">
                Ingredients
              </h2>
              <span>{recipe.ingredients.length} items</span>
            </div>
            {onToggleGroceries && (
              <button
                type="button"
                className={`text-button grocery-toggle-btn inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap text-[13px] font-[550] transition-colors duration-200 cursor-pointer ${
                  inGroceries ? "is-active text-accent font-semibold" : "text-muted hover:text-ink"
                }`}
                onClick={() => onToggleGroceries(recipe.id, servings)}
                aria-pressed={inGroceries}
              >
                <ShoppingBag size={14} />
                <span>{inGroceries ? "In Groceries" : "Add to Groceries"}</span>
              </button>
            )}
          </div>
          <div className="servings-control border-y border-line flex items-center justify-between max-[1150px]:flex-col max-[1150px]:items-stretch gap-2 max-[1150px]:gap-2.5 max-[580px]:gap-3 min-h-[52px] max-[1150px]:min-h-0 mb-[11px] max-[580px]:mb-4 py-1.5 max-[1150px]:py-2.5 max-[580px]:py-3 text-xs max-[580px]:text-[13px]">
            <div className="servings-stepper flex items-center shrink-0 gap-2.5 max-[1150px]:w-full max-[1150px]:justify-between">
              <span>Servings</span>
              <div className="flex items-center gap-[3px]">
                <IconButton
                  size="sm"
                  onClick={() => setServings(Math.max(1, servings - 1))}
                  disabled={servings <= 1}
                  aria-label="Fewer servings"
                  className="w-8 h-8 max-[580px]:w-11 max-[580px]:h-11"
                >
                  <Minus size={15} />
                </IconButton>
                <output aria-label="Adjusted servings" className="text-center tabular-nums min-w-[22px] text-[13px] font-semibold text-ink">
                  {servings}
                </output>
                <IconButton
                  size="sm"
                  onClick={() => setServings(Math.min(100, servings + 1))}
                  disabled={servings >= 100}
                  aria-label="More servings"
                  className="w-8 h-8 max-[580px]:w-11 max-[580px]:h-11"
                >
                  <Plus size={15} />
                </IconButton>
              </div>
            </div>
            <div
              className="unit-toggle inline-flex items-center shrink-0 border border-line bg-[#edf2e9] rounded-full p-0.5 gap-0.5 max-[1150px]:w-full max-[580px]:p-[3px]"
              role="group"
              aria-label="Measurement units"
            >
              {["original", "us", "metric"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={cn(
                    "unit-toggle-btn inline-flex items-center justify-center text-center whitespace-nowrap border-0 rounded-full px-2 py-1 text-[11px] max-[1150px]:flex-1 max-[1150px]:px-1 max-[1150px]:py-1.5 max-[1150px]:text-[11.5px] max-[580px]:min-h-[38px] max-[580px]:py-2 max-[580px]:text-xs leading-none font-medium cursor-pointer transition-all duration-150 select-none",
                    unitSystem === opt
                      ? "active bg-paper text-ink font-semibold shadow-sm"
                      : "bg-transparent text-muted hover:text-ink"
                  )}
                  onClick={() => setUnitSystem(opt)}
                  aria-pressed={unitSystem === opt}
                >
                  {opt === "original" ? "Original" : opt === "us" ? "US" : "Metric"}
                </button>
              ))}
            </div>
          </div>
          <div className="ingredient-groups space-y-6">
            {ingredientGroups.map(([group, ingredients]) => (
              <section
                className="ingredient-group"
                key={group || "ingredients"}
              >
                {group && (
                  <h3 className="border-b border-line text-[#234d3c] tracking-[0.09em] uppercase m-0 pb-2 text-[10px] font-bold">
                    {group}
                  </h3>
                )}
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
            <div className="equipment mt-[33px] max-[580px]:mt-[26px]">
              <h3 className="eyebrow block text-[10px] font-semibold tracking-[0.08em] uppercase text-muted mb-[9px]">
                On the counter
              </h3>
              <p className="text-muted text-xs max-[580px]:text-[13px] leading-[1.8] m-0">
                {recipe.equipment.join(" / ")}
              </p>
            </div>
          )}
        </section>
        <section className="method-panel scroll-mt-[90px] outline-none max-[580px]:border-t max-[580px]:border-line max-[580px]:pt-7" id="method" tabIndex={-1}>
          <div className="section-heading flex items-center justify-between gap-3 mb-[27px] max-[580px]:mb-[21px]">
            <h2 className="font-serif font-normal text-[31px] max-[800px]:text-[26px] max-[580px]:text-[30px] leading-[1.2] m-0 text-ink">
              Let's make it.
            </h2>
            <span aria-live="polite" className="text-muted whitespace-nowrap text-[10px] max-[580px]:text-[11px]">
              {
                checkedSteps.filter((id) =>
                  recipe.steps.some((step) => step.id === id),
                ).length
              }{" "}
              / {recipe.steps.length} done
            </span>
          </div>
          <ol className="step-list m-0 p-0 list-none">
            {recipe.steps.map((step, index) => {
              const isCompleted = checkedSteps.includes(step.id);
              return (
                <li
                  key={step.id}
                  className={cn(
                    "grid grid-cols-[44px_minmax(0,1fr)] max-[800px]:grid-cols-[37px_1fr] max-[580px]:grid-cols-[44px_minmax(0,1fr)] gap-[22px] max-[800px]:gap-[13px] max-[580px]:gap-4 mb-[34px] max-[580px]:mb-[29px]",
                    isCompleted && "completed"
                  )}
                >
                  <button
                    className={cn(
                      "step-number w-11 h-11 max-[800px]:w-[37px] max-[800px]:h-[37px] max-[580px]:w-11 max-[580px]:h-11 rounded-full flex items-center justify-center font-serif italic text-lg max-[800px]:text-base max-[580px]:text-lg cursor-pointer transition-colors duration-200 border select-none",
                      isCompleted
                        ? "bg-[#234d3c] border-[#234d3c] text-white"
                        : "bg-[#e9efe5] border-[#c9d7c5] text-[#234d3c] hover:bg-[#dae6d5]"
                    )}
                    aria-label={`Mark step ${index + 1} ${isCompleted ? "incomplete" : "complete"}`}
                    aria-pressed={isCompleted}
                    onClick={() => toggle("steps", step.id)}
                  >
                    {isCompleted ? (
                      <Check size={20} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </button>
                  <div>
                    {step.title && (
                      <h3 className={cn("mt-[7px] max-[800px]:mt-[5px] max-[580px]:mt-1.5 mb-[11px] max-[580px]:mb-[9px] text-[17px] max-[800px]:text-base max-[580px]:text-lg font-semibold leading-[1.5]", isCompleted ? "text-[#71806e]" : "text-ink")}>
                        {step.title}
                      </h3>
                    )}
                    <p className={cn("m-0 text-base max-[800px]:text-sm max-[580px]:text-base leading-[1.85]", isCompleted ? "text-[#71806e]" : "text-[#566458]")}>
                      {step.instruction}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {checkedSteps.length === recipe.steps.length && (
            <p className="done-note text-[#234d3c] font-serif italic text-lg max-[580px]:text-base max-[580px]:leading-[1.5] flex items-center gap-2.5 mb-5 ml-[66px] max-[800px]:ml-[50px] max-[580px]:ml-[60px]">
              <Check size={19} />
              All done. Enjoy every bite.
            </p>
          )}
          {(checkedSteps.length > 0 || checkedIngredients.length > 0) && (
            <TextButton
              className="text-button reset-progress inline-flex items-center gap-2 text-xs text-muted hover:text-ink cursor-pointer transition-colors -mt-2.5 ml-[66px] max-[800px]:ml-[50px] max-[580px]:ml-[60px]"
              onClick={() => onProgress({ ingredients: [], steps: [] })}
            >
              <RotateCcw size={14} />
              Reset cooking checklist
            </TextButton>
          )}
          {(recipe.notes.length > 0 || recipe.substitutions.length > 0) && (
            <aside className="kitchen-notes border-t border-line mt-[30px] max-[580px]:mt-[26px] ml-[66px] max-[800px]:ml-[50px] max-[580px]:ml-0 pt-[30px] max-[580px]:pt-[27px]">
              <span className="eyebrow block text-[10px] font-semibold tracking-[0.08em] uppercase text-muted">
                The small things
              </span>
              <h2 className="font-serif font-normal text-[26px] max-[580px]:text-[28px] my-[9px] mb-4 text-ink">
                Kitchen notes
              </h2>
              {recipe.notes.map((note, index) => (
                <p key={index} className="text-muted mb-3 text-[13px] max-[580px]:text-sm leading-[1.8]">
                  {note}
                </p>
              ))}
              {recipe.substitutions.length > 0 && (
                <>
                  <h3 className="mt-[25px] mb-[9px] text-[13px] max-[580px]:text-sm font-semibold text-ink">
                    Make it work with what you have
                  </h3>
                  {recipe.substitutions.map((note, index) => (
                    <p key={index} className="text-muted mb-3 text-[13px] max-[580px]:text-sm leading-[1.8]">
                      {note}
                    </p>
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
      <div className="detail-bottom border-t border-line flex items-center justify-between mt-[30px] pt-5">
        <a
          className="back-link inline-flex items-center gap-[9px] min-h-[44px] text-[13px] max-[580px]:text-xs text-muted hover:text-terracotta transition-colors duration-150 select-none"
          href="#/"
        >
          <ArrowLeft size={17} />
          Back to the shelf
        </a>
        <span className="eyebrow block text-[10px] max-[580px]:text-[8px] font-semibold tracking-[0.08em] uppercase text-muted">
          A recipe worth keeping.
        </span>
      </div>
    </main>
  );
}
