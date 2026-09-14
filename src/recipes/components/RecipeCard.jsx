import { ArrowUpRight, Bookmark, Clock3, UsersRound } from "lucide-react";
import RecipeArtwork from "./RecipeArtwork";
import { totalMinutes } from "../library";

export default function RecipeCard({ recipe, favorite, onFavorite }) {
  return (
    <article className="recipe-card">
      <a
        className="recipe-card__link"
        href={`#/recipe/${recipe.id}`}
        aria-label={`Cook ${recipe.title}`}
      >
        <RecipeArtwork artwork={recipe.artwork} title={recipe.title} />
        <div className="recipe-card__body">
          <span className="eyebrow recipe-card__category">
            {recipe.category}
            <span>{recipe.example ? "Starter recipe" : "My recipe"}</span>
          </span>
          <h2>{recipe.title}</h2>
          <p>{recipe.description}</p>
          <div className="recipe-card__meta">
            <span>
              <Clock3 size={14} />
              {totalMinutes(recipe)} min
            </span>
            <span>
              <UsersRound size={14} />
              {recipe.servings}
            </span>
            <ArrowUpRight className="recipe-card__arrow" size={19} />
          </div>
        </div>
      </a>
      <button
        className={`icon-button recipe-card__save ${favorite ? "is-saved" : ""}`}
        onClick={() => onFavorite(recipe.id)}
        aria-label={`${favorite ? "Unsave" : "Save"} ${recipe.title} to favorites`}
        aria-pressed={favorite}
        title={favorite ? "Remove from favorites" : "Save to favorites"}
      >
        <Bookmark size={18} fill={favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
