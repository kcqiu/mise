import { ArrowRight, Bookmark, Clock, Users } from "lucide-react";
import { formatShelfTime } from "@/recipes/components/RecipeCard";
import { cn } from "@/lib/utils";

/**
 * CulinaryGlassCard - Adapted from card-21 for the MISE design system.
 * Features:
 * - Full-bleed culinary photography with parallax zoom on hover
 * - Rich charcoal gradient overlay for optimal editorial text legibility
 * - Glassified circular bookmark button for favorites
 * - Fraunces serif typography and terracotta category badge
 * - Frosted glass action button ("See Recipe")
 * - Ambient warm culinary shadow instead of harsh neon glow
 */
export function CulinaryGlassCard({
  recipe,
  favorite = false,
  onFavorite,
  className = "",
  href,
}) {
  const timeStr = formatShelfTime(recipe);
  const targetHref = href || `#/recipe/${recipe.id}`;
  const imageUrl = recipe.artwork?.url || recipe.artwork || "/recipe/art/cookbook-banner.webp";

  return (
    <div className={cn("culinary-glass-card-wrapper group relative w-full h-full min-h-[480px] max-[600px]:min-h-[420px]", className)}>
      <div className="culinary-glass-card relative block w-full h-full min-h-[480px] max-[600px]:min-h-[420px] rounded-[20px] overflow-hidden bg-[#24231f] shadow-[0_16px_36px_-8px_rgba(36,35,31,0.28)] transition-all duration-[450ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:scale-[1.02] group-hover:shadow-[0_24px_50px_-10px_rgba(36,35,31,0.42)]">
        {/* Full-bleed photography background */}
        <div
          className="culinary-glass-card__bg absolute inset-0 bg-cover [background-position:center_30%] transition-transform duration-600 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-108"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />

        {/* Themed editorial gradient overlay */}
        <div className="culinary-glass-card__gradient absolute inset-0 bg-gradient-to-t from-[#24231f]/[0.95] from-0% via-[#24231f]/[0.72] via-[38%] via-[#24231f]/20 via-[65%] to-transparent to-[85%] pointer-events-none" />

        {/* Glassified favorite bookmark button */}
        {onFavorite && (
          <button
            type="button"
            className={cn(
              "culinary-glass-card__favorite absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 p-0 border rounded-full backdrop-blur-[16px] cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-all duration-200 hover:scale-108",
              favorite
                ? "is-saved border-white bg-white text-[#24231f] shadow-[0_4px_20px_rgba(255,255,255,0.4)]"
                : "border-white/35 bg-white/[0.18] text-white hover:bg-white/35 hover:text-white"
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFavorite(recipe.id);
            }}
            aria-label={favorite ? "Remove from favorites" : "Save to favorites"}
            title={favorite ? "Remove from favorites" : "Save to favorites"}
          >
            <Bookmark
              size={18}
              strokeWidth={2}
              fill={favorite ? "currentColor" : "none"}
            />
          </button>
        )}

        {/* Link & Content area */}
        <a
          href={targetHref}
          className="culinary-glass-card__content relative z-[2] flex flex-col justify-end h-full p-6 max-[600px]:p-[18px] text-white no-underline box-border focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-2"
          aria-label={`View recipe for ${recipe.title}`}
        >
          {recipe.category && (
            <span className="culinary-glass-card__category inline-block mb-1.5 text-[#e58d7c] text-[11px] font-bold tracking-[0.08em] uppercase">
              {recipe.category}
            </span>
          )}

          <h3 className="culinary-glass-card__title m-0 mb-2 font-serif text-[26px] max-[600px]:text-[22px] font-medium leading-[1.15] tracking-[-0.01em] text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.3)]">
            {recipe.title}
          </h3>

          {recipe.description && (
            <p className="culinary-glass-card__description m-0 mb-4 text-[13.5px] leading-[1.45] text-white/85 line-clamp-2">
              {recipe.description}
            </p>
          )}

          {/* Meta row: cooking time & servings */}
          <div className="culinary-glass-card__meta flex items-center gap-4 mb-5 text-[12.5px] text-white/80">
            {timeStr && (
              <span className="culinary-glass-card__meta-item inline-flex items-center gap-1.5">
                <Clock size={13} strokeWidth={2} />
                <span>{timeStr}</span>
              </span>
            )}
            {recipe.servings && (
              <span className="culinary-glass-card__meta-item inline-flex items-center gap-1.5">
                <Users size={13} strokeWidth={2} />
                <span>{recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}</span>
              </span>
            )}
          </div>

          {/* Glass action button */}
          <div className="culinary-glass-card__action flex items-center justify-between px-[18px] py-3 border border-white/25 rounded-xl bg-white/[0.14] backdrop-blur-[12px] text-[13.5px] font-semibold text-white transition-all duration-250 group-hover:border-white/45 group-hover:bg-white/[0.24]">
            <span>See Recipe</span>
            <ArrowRight size={15} strokeWidth={2.2} className="transition-transform duration-250 group-hover:translate-x-1" />
          </div>
        </a>
      </div>
    </div>
  );
}

export default CulinaryGlassCard;
