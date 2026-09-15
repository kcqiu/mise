import { ArrowRight, Bookmark, Clock, Users } from "lucide-react";
import { RECIPE_IMAGES, totalMinutes } from "../library";

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
      className={`recipe-card recipe-card--${variant} ${slot ? `recipe-card--slot-${slot}` : ""}`}
    >
      <a
        className="recipe-card__link"
        href={`#/recipe/${recipe.id}`}
        aria-label={`Cook ${recipe.title}`}
      >
        <div
          className="recipe-card__bg"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
        <div className="recipe-card__gradient" />

        <div className="recipe-card__body">
          {recipe.category && (
            <span className="recipe-card__category">{recipe.category}</span>
          )}
          <h2 className="recipe-card__title">{recipe.title}</h2>
          {!compact && recipe.description && (
            <p className="recipe-card__description">{recipe.description}</p>
          )}
          <div className="recipe-card__meta">
            {timeStr && (
              <span className="recipe-card__meta-item">
                <Clock size={13} strokeWidth={2} />
                <span>{timeStr}</span>
              </span>
            )}
            {recipe.servings && (
              <span className="recipe-card__meta-item">
                <Users size={13} strokeWidth={2} />
                <span>
                  {recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}
                </span>
              </span>
            )}
          </div>
          <div className="recipe-card__action">
            <span>Cook Recipe</span>
            <ArrowRight size={15} strokeWidth={2.2} />
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
        <Bookmark size={18} strokeWidth={2} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
