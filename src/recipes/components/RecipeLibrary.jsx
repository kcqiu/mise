import { useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  Bookmark,
  BookOpen,
  Check,
  ChefHat,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { createSearch, getCategories, totalMinutes } from "../library";
import RecipeCard from "./RecipeCard";

export default function RecipeLibrary({
  recipes,
  favorites,
  onFavorite,
  state,
  onState,
  onAdd,
}) {
  const { query, category, collection, sort } = state;
  const [filtersOpen, setFiltersOpen] = useState(false);
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
      <div className="shelf-intro">
        <div>
          <div className="eyebrow shelf-intro__label">
            <span className="little-rule" /> A personal cookbook
          </div>
          <h1>
            The recipe <em>shelf.</em>
          </h1>
          <p>Good things to make. And make again.</p>
        </div>
        <div className="shelf-stamp" aria-hidden="true">
          <ChefHat size={32} strokeWidth={1.3} />
          <span>Made at home</span>
        </div>
      </div>
      <div className="shelf-layout">
        <aside className="shelf-sidebar" aria-label="Recipe collections">
          <nav className="collection-tabs">
            <button
              className={collection === "all" ? "active" : ""}
              aria-pressed={collection === "all"}
              onClick={() => set({ collection: "all" })}
            >
              <BookOpen size={18} />
              All recipes<span>{recipes.length}</span>
            </button>
            <button
              className={collection === "favorites" ? "active" : ""}
              aria-pressed={collection === "favorites"}
              onClick={() => set({ collection: "favorites" })}
            >
              <Bookmark size={18} />
              Favorites
              <span>
                {
                  favorites.filter((id) =>
                    recipes.some((recipe) => recipe.id === id),
                  ).length
                }
              </span>
            </button>
          </nav>
          <div className={`category-panel ${filtersOpen ? "is-open" : ""}`}>
            <h2 className="eyebrow">By category</h2>
            <nav aria-label="Recipe categories">
              <button
                className={!category ? "active" : ""}
                aria-pressed={!category}
                onClick={() => {
                  set({ category: "" });
                  setFiltersOpen(false);
                }}
              >
                <span>Everything</span>
                {!category && <Check size={14} />}
              </button>
              {categories.map(([name, count]) => (
                <button
                  key={name}
                  className={category === name ? "active" : ""}
                  aria-pressed={category === name}
                  onClick={() => {
                    set({ category: name });
                    setFiltersOpen(false);
                  }}
                >
                  <span>{name}</span>
                  <span>{count}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-note">
            <span className="eyebrow">A little collection</span>
            <p>
              Keep the keepers.
              <br />
              Make room for new favorites.
            </p>
            <button className="text-button" onClick={onAdd}>
              Write a recipe <span aria-hidden="true">+</span>
            </button>
          </div>
        </aside>
        <section className="shelf-content" aria-label="Recipes">
          <div className="search-row">
            <div className="search-field">
              <Search size={20} />
              <input
                type="search"
                value={query}
                onChange={(event) => set({ query: event.target.value })}
                placeholder="Find a recipe or ingredient..."
                aria-label="Search recipes"
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => set({ query: "" })}
                  aria-label="Clear search"
                >
                  <X size={17} />
                </button>
              )}
            </div>
            <button
              className={`icon-button mobile-filter ${filtersOpen ? "active" : ""}`}
              aria-label="Filter by category"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal size={20} />
            </button>
          </div>
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
            <label className="sort-control">
              <ArrowDownWideNarrow size={15} />
              <span className="sr-only">Sort recipes</span>
              <select
                value={sort}
                onChange={(event) => set({ sort: event.target.value })}
              >
                <option value="collection">Latest added</option>
                <option value="time">Quickest first</option>
                <option value="az">Name, A to Z</option>
              </select>
            </label>
          </div>
          {category && (
            <button
              className="filter-chip"
              onClick={() => set({ category: "" })}
            >
              {category}
              <X size={13} />
            </button>
          )}
          {results.length ? (
            <div className="recipe-grid">
              {results.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  recipe={recipe}
                  favorite={favorites.includes(recipe.id)}
                  onFavorite={onFavorite}
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
      </div>
    </main>
  );
}
