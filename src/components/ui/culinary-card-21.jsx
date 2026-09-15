import { ArrowRight, Bookmark, Clock, Users } from "lucide-react";
import { formatShelfTime } from "@/recipes/components/RecipeCard";
import "./culinary-card-21.css";

/**
 * CulinaryGlassCard - Adapted from card-21 for the MISE design system.
 * Features:
 * - Full-bleed culinary photography with parallax zoom on hover
 * - Rich charcoal gradient overlay for optimal editorial text legibility
 * - Glassified circular bookmark button for favorites
 * - Fraunces serif typography and terracotta category badge
 * - Frosted glass action button ("Cook Recipe")
 * - Ambient warm culinary shadow instead of harsh neon glow
 */
export function CulinaryGlassCard({
  recipe,
  favorite = false,
  onFavorite,
  className = "",
  themeColor = "36 8% 13%", // MISE warm charcoal #24231F
  href,
}) {
  const timeStr = formatShelfTime(recipe);
  const targetHref = href || `#/recipe/${recipe.id}`;
  const imageUrl = recipe.artwork?.url || recipe.artwork || "/recipe/art/cookbook-banner.webp";

  return (
    <div
      className={`culinary-glass-card-wrapper ${className}`}
      style={{
        "--theme-color": themeColor,
      }}
    >
      <div className="culinary-glass-card">
        {/* Full-bleed photography background */}
        <div
          className="culinary-glass-card__bg"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />

        {/* Themed editorial gradient overlay */}
        <div className="culinary-glass-card__gradient" />

        {/* Glassified favorite bookmark button */}
        {onFavorite && (
          <button
            type="button"
            className={`culinary-glass-card__favorite ${favorite ? "is-saved" : ""}`}
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
          className="culinary-glass-card__content"
          aria-label={`View recipe for ${recipe.title}`}
        >
          {recipe.category && (
            <span className="culinary-glass-card__category">
              {recipe.category}
            </span>
          )}

          <h3 className="culinary-glass-card__title">
            {recipe.title}
          </h3>

          {recipe.description && (
            <p className="culinary-glass-card__description">
              {recipe.description}
            </p>
          )}

          {/* Meta row: cooking time & servings */}
          <div className="culinary-glass-card__meta">
            {timeStr && (
              <span className="culinary-glass-card__meta-item">
                <Clock size={13} strokeWidth={2} />
                <span>{timeStr}</span>
              </span>
            )}
            {recipe.servings && (
              <span className="culinary-glass-card__meta-item">
                <Users size={13} strokeWidth={2} />
                <span>{recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}</span>
              </span>
            )}
          </div>

          {/* Glass action button */}
          <div className="culinary-glass-card__action">
            <span>See Recipe</span>
            <ArrowRight size={15} strokeWidth={2.2} />
          </div>
        </a>
      </div>
    </div>
  );
}

export default CulinaryGlassCard;
