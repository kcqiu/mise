import { Bookmark, Clock, Users } from "lucide-react";
import RecipeArtwork from "./RecipeArtwork";
import { totalMinutes } from "../library";

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

  return (
    <article
      className={`recipe-card recipe-card--${variant} ${slot ? `recipe-card--slot-${slot}` : ""}`}
    >
      <a
        className="recipe-card__link"
        href={`#/recipe/${recipe.id}`}
        aria-label={`Cook ${recipe.title}`}
      >
        <RecipeArtwork artwork={recipe.artwork} title={recipe.title} />
        <div className="recipe-card__body">
          <div className="recipe-card__header">
            <h2 className="recipe-card__title">{recipe.title}</h2>
            {recipe.category && (
              <span className="recipe-card__category">{recipe.category}</span>
            )}
          </div>
          {!compact && recipe.description && (
            <p className="recipe-card__description">{recipe.description}</p>
          )}
          <div className="recipe-card__meta">
            {timeStr && (
              <span className="recipe-card__meta-item">
                <Clock size={13} strokeWidth={1.75} />
                <span>{timeStr}</span>
              </span>
            )}
            {recipe.servings && (
              <span className="recipe-card__meta-item">
                <Users size={13} strokeWidth={1.75} />
                <span>{recipe.servings}</span>
              </span>
            )}
          </div>
        </div>
      </a>
      <button
        type="button"
        className={`icon-button recipe-card__save ${favorite ? "is-saved" : ""}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onFavorite(recipe.id);
        }}
        aria-label={`${favorite ? "Unsave" : "Save"} ${recipe.title} to favorites`}
        aria-pressed={favorite}
        title={favorite ? "Remove from favorites" : "Save to favorites"}
      >
        <Bookmark size={16} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
