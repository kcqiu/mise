import { useMemo } from "react";
import { BookOpen, Search, X } from "lucide-react";
import { createSearch, getCategories, totalMinutes } from "../library";
import RecipeCard from "./RecipeCard";

export default function RecipeLibrary({
  recipes,
  favorites,
  onFavorite,
  state,
  onState,
}) {
  const { query, category, collection, sort } = state;
  const search = useMemo(() => createSearch(recipes), [recipes]);
  const categories = useMemo(() => getCategories(recipes), [recipes]);
  const results = useMemo(() => {
    const selected = search(query).filter(
      (recipe) =>
        (!category || recipe.category === category) &&
        (collection !== "favorites" || favorites.includes(recipe.id)),
    );
    if (sort === "time") {
      selected.sort((a, b) => totalMinutes(a) - totalMinutes(b));
    } else if (sort === "az") {
      selected.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "collection" && !query) {
      selected.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) return timeB - timeA;
        if (timeA && !timeB) return -1;
        if (!timeA && timeB) return 1;
        return 0;
      });
    }
    return selected;
  }, [search, query, category, collection, favorites, sort]);
  const set = (patch) => onState({ ...state, ...patch });

  return (
    <main id="recipe-main" className="shelf" tabIndex={-1}>
      <section className="shelf-banner" aria-label="Cookbook overview">
        <div className="shelf-banner__left">
          <div className="eyebrow shelf-intro__label shelf-banner__eyebrow">
            <span className="little-rule" /> A personal cookbook
          </div>
          <h1 className="shelf-banner__title">
            The recipe <em>shelf.</em>
          </h1>
          <p className="shelf-banner__subtitle">
            Good things to make. And make again.
          </p>
        </div>
        <div className="shelf-banner__image-wrap">
          <img
            src="/recipe/art/cookbook-banner.webp"
            alt="Artisanal kitchen counter with fresh lemons and olive oil"
            className="shelf-banner__image"
            width="868"
            height="220"
            loading="eager"
          />
        </div>
      </section>
      <section className="shelf-content" aria-label="Recipes">
        <div className="shelf-tools">
          <div className="search-row shelf-search-row">
            <div className="search-field shelf-search-field">
              <Search size={18} />
              <input
                type="search"
                value={query}
                onChange={(event) => set({ query: event.target.value })}
                placeholder="Search your recipes, ingredients, notes..."
                aria-label="Search recipes"
              />
              {query && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => set({ query: "" })}
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <nav className="collection-tabs shelf-collection-tabs" aria-label="Recipe collections">
              <button
                type="button"
                className={collection === "all" ? "active" : ""}
                aria-pressed={collection === "all"}
                onClick={() => set({ collection: "all" })}
              >
                All recipes
              </button>
              <button
                type="button"
                className={collection === "favorites" ? "active" : ""}
                aria-pressed={collection === "favorites"}
                onClick={() => set({ collection: "favorites" })}
              >
                Favorites
              </button>
            </nav>
          </div>
          <div className="category-panel shelf-category-panel">
            <nav className="category-nav shelf-category-nav" aria-label="Recipe categories">
              <button
                type="button"
                className={`category-pill shelf-category-btn ${!category ? "active" : ""}`}
                aria-pressed={!category}
                onClick={() => set({ category: "" })}
              >
                All
              </button>
              {categories.map(([name, count]) => (
                <button
                  type="button"
                  key={name}
                  className={`category-pill shelf-category-btn ${category === name ? "active" : ""}`}
                  aria-pressed={category === name}
                  onClick={() => set({ category: name })}
                >
                  {name}
                  {Boolean(count) && (
                    <span className="category-pill__count">{count}</span>
                  )}
                </button>
              ))}
            </nav>
            <label className="sort-control shelf-sort-control">
              <span className="sr-only">Sort recipes</span>
              <select
                value={sort}
                onChange={(event) => set({ sort: event.target.value })}
              >
                <option value="collection">Recently added</option>
                <option value="time">Quickest first</option>
                <option value="az">Name, A to Z</option>
              </select>
            </label>
          </div>
        </div>
        {(query || category || collection === "favorites") && (
          <div className="results-bar">
            <p aria-live="polite">
              <strong>
                {query
                  ? `Results for "${query}"`
                  : category ||
                    (collection === "favorites"
                      ? "Your favorites"
                      : "The whole collection")}
              </strong>
              <span>
                {results.length} {results.length === 1 ? "recipe" : "recipes"}
              </span>
            </p>
            {category && (
              <button
                type="button"
                className="filter-chip"
                onClick={() => set({ category: "" })}
              >
                Clear {category}
                <X size={13} />
              </button>
            )}
          </div>
        )}
        {results.length ? (
          <div className="recipe-grid recipe-grid--shelf">
            {results.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                favorite={favorites.includes(recipe.id)}
                onFavorite={onFavorite}
                variant="standard"
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <BookOpen size={38} strokeWidth={1.2} />
            <h2>
              {collection === "favorites" && !query && !category
                ? "A shelf for your favorites."
                : "Nothing on the shelf. Yet."}
            </h2>
            <p>
              {collection === "favorites" && !query && !category
                ? "Save a recipe with the bookmark to keep it here."
                : "Try another ingredient, or clear your filters."}
            </p>
            <button
              type="button"
              className="button button--light"
              onClick={() =>
                set({ query: "", category: "", collection: "all" })
              }
            >
              Browse all recipes
            </button>
          </div>
        )}
        <div className="shelf-footnote">
          <span className="little-rule" />
          {recipes.some((recipe) => recipe.example)
            ? "Starter recipes are here to try. Your own recipes belong right alongside them."
            : "Your collection, one recipe at a time."}
        </div>
      </section>
    </main>
  );
}

