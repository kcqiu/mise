import { ArrowRight, Bookmark, Clock, Users } from "lucide-react";
import { RECIPE_IMAGES, totalMinutes } from "../library";
import { cn } from "@/lib/utils";

export function formatShelfTime(recipe) {
  const total = totalMinutes(recipe);
  if (!total) return "";
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
}

export default function RecipeCard({
  recipe,
  favorite,
  onFavorite,
  variant = "standard",
  slot,
}) {
  const compact = variant === "compact";
  const timeStr = formatShelfTime(recipe);
  const imageUrl =
    RECIPE_IMAGES[recipe.artwork] ||
    (typeof recipe.artwork === "string" &&
    (recipe.artwork.startsWith("http://") ||
      recipe.artwork.startsWith("https://") ||
      recipe.artwork.startsWith("data:image/") ||
      recipe.artwork.startsWith("/"))
      ? recipe.artwork
      : "/recipe/art/cookbook-banner.webp");

  return (
    <article
      className={cn(
        "recipe-card group relative block w-full h-full rounded-[20px] overflow-hidden bg-[#24231f] shadow-[0_16px_36px_-8px_rgba(36,35,31,0.28)] transition-all duration-[450ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:scale-[1.015] hover:shadow-[0_24px_50px_-10px_rgba(36,35,31,0.42)]",
        compact ? "min-h-[380px]" : "min-h-[480px] max-[601px]:min-h-[420px]",
        `recipe-card--${variant}`,
        slot && `recipe-card--slot-${slot}`
      )}
    >
      <a
        className={cn(
          "recipe-card__link relative z-[2] flex flex-col justify-end h-full p-6 max-[601px]:p-[18px] text-white no-underline box-border focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-2",
          compact ? "min-h-[380px]" : "min-h-[480px] max-[601px]:min-h-[420px]"
        )}
        href={`#/recipe/${recipe.id}`}
        aria-label={`Cook ${recipe.title}`}
      >
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="recipe-card__bg absolute inset-0 w-full h-full object-cover object-[center_30%] transition-transform duration-600 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-108 pointer-events-none"
        />
        <div className="recipe-card__gradient absolute inset-0 bg-gradient-to-t from-[#24231f]/[0.96] from-0% via-[#24231f]/[0.72] via-[38%] via-[#24231f]/20 via-[65%] to-transparent to-[85%] pointer-events-none" />

        <div className="recipe-card__body relative z-[2] flex flex-col p-0">
          {recipe.category && (
            <span className="recipe-card__category inline-block mb-1.5 text-[#e58d7c] text-[11px] max-[769px]:text-[10px] font-bold tracking-[0.08em] uppercase">
              {recipe.category}
            </span>
          )}
          <h2 className="recipe-card__title m-0 mb-2 text-white font-serif text-[26px] max-[601px]:text-[22px] font-normal leading-[1.15] tracking-[-0.01em] [text-shadow:0_2px_8px_rgba(0,0,0,0.3)]">
            {recipe.title}
          </h2>
          {!compact && recipe.description && (
            <p className="recipe-card__description m-0 mb-4 text-white/85 text-[13.5px] leading-[1.45] line-clamp-2">
              {recipe.description}
            </p>
          )}
          <div className="recipe-card__meta flex items-center gap-4 mb-5 text-white/80 text-[12.5px] font-medium">
            {timeStr && (
              <span className="recipe-card__meta-item inline-flex items-center gap-1.5 text-white/80">
                <Clock size={13} strokeWidth={2} className="shrink-0 stroke-current" />
                <span>{timeStr}</span>
              </span>
            )}
            {recipe.servings && (
              <span className="recipe-card__meta-item inline-flex items-center gap-1.5 text-white/80">
                <Users size={13} strokeWidth={2} className="shrink-0 stroke-current" />
                <span>
                  {recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}
                </span>
              </span>
            )}
          </div>
          <div className="recipe-card__action flex items-center justify-between px-[18px] py-3 border border-white/25 rounded-xl bg-white/[0.14] text-white text-[13.5px] font-semibold tracking-[0.02em] backdrop-blur-[12px] transition-all duration-250 group-hover:border-white/45 group-hover:bg-white/[0.24]">
            <span>See Recipe</span>
            <ArrowRight size={15} strokeWidth={2.2} className="transition-transform duration-250 group-hover:translate-x-1" />
          </div>
        </div>
      </a>
      <button
        type="button"
        className={cn(
          "recipe-card__save absolute z-10 top-4 right-4 flex items-center justify-center w-10 h-10 p-0 border rounded-full backdrop-blur-[16px] cursor-pointer transition-all duration-200 hover:scale-108",
          favorite
            ? "is-saved border-white bg-white text-[#24231f] shadow-[0_4px_20px_rgba(255,255,255,0.4)]"
            : "border-white/35 bg-white/[0.18] text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] hover:bg-white/35 hover:text-white"
        )}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onFavorite(recipe.id);
        }}
        aria-label={`${favorite ? "Unsave" : "Save"} ${recipe.title} to favorites`}
        aria-pressed={favorite}
        title={favorite ? "Remove from favorites" : "Save to favorites"}
      >
        <Bookmark size={18} strokeWidth={2} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
