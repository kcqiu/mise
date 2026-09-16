import { useMemo } from "react";
import { BookOpen, X } from "lucide-react";
import { PlaceholdersAndVanishInput } from "../../components/ui/placeholders-and-vanish-input";
import Button from "../../components/ui/Button";
import { createSearch, getCategories, totalMinutes } from "../library";
import { cn } from "@/lib/utils";
import RecipeCard from "./RecipeCard";

const SEARCH_PLACEHOLDERS = [
  "Search recipes, ingredients, and notes",
  "Find a quick weeknight dinner",
  "Look for pasta, mushrooms, or matcha",
  "Return to a recipe you loved",
];

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
    <main id="recipe-main" className="shelf w-[min(1312px,calc(100%-48px))] min-[1500px]:w-[min(1360px,calc(100%-160px))] max-[1151px]:w-[calc(100%-72px)] max-[801px]:w-[calc(100%-48px)] max-[581px]:w-[calc(100%-36px)] mx-auto" tabIndex={-1}>
      <section
        className="shelf-banner grid grid-cols-[420px_868px] min-[769px]:max-[1361px]:grid-cols-[minmax(0,0.484fr)_minmax(0,1fr)] max-[769px]:grid-cols-1 items-center gap-6 min-[769px]:max-[1361px]:gap-5 max-[769px]:gap-[18px] w-full max-w-[1312px] mx-auto mb-9 max-[769px]:mb-6 pt-6 max-[769px]:pt-4"
        aria-label="Cookbook overview"
      >
        <div className="shelf-banner__left flex flex-col justify-center min-w-0">
          <div className="shelf-banner__eyebrow flex items-center gap-2.5 mb-3 text-terracotta text-[10px] leading-[1.5] font-semibold uppercase tracking-wider">
            <span className="little-rule inline-block w-[23px] h-px bg-current shrink-0" /> A personal cookbook
          </div>
          <h1 className="shelf-banner__title font-serif font-normal text-5xl max-[769px]:text-[34px] leading-[1.08] tracking-[-0.02em] text-ink m-0 mb-2.5">
            The recipe <em className="text-ink italic font-normal">shelf.</em>
          </h1>
          <p className="shelf-banner__subtitle text-muted text-sm leading-[1.5] m-0">
            Good things to make. And make again.
          </p>
        </div>
        <div className="shelf-banner__image-wrap shrink-0 w-[868px] min-[769px]:max-[1361px]:w-full h-[220px] min-[769px]:max-[1361px]:h-auto min-[769px]:max-[1361px]:aspect-[868/220] max-[769px]:w-full max-[769px]:h-auto max-[769px]:aspect-[868/220] rounded-2xl max-[769px]:rounded-xl overflow-hidden bg-[#e8ede3]">
          <img
            src="/recipe/art/cookbook-banner.webp"
            alt="Artisanal kitchen counter with fresh lemons and olive oil"
            className="shelf-banner__image block w-full h-full object-cover"
            width="868"
            height="220"
            loading="eager"
          />
        </div>
      </section>
      <section className="shelf-content" aria-label="Recipes">
        <div className="shelf-tools mb-7 max-[769px]:mb-6 pt-1.5 max-[769px]:pt-1 pb-4 max-[769px]:pb-5 border-b border-line">
          <div className="search-row flex max-[769px]:flex-col items-center max-[769px]:items-stretch justify-between gap-6 max-[769px]:gap-3.5">
            <PlaceholdersAndVanishInput
              placeholders={SEARCH_PLACEHOLDERS}
              value={query}
              onChange={(event) => set({ query: event.target.value })}
              onClear={() => set({ query: "" })}
            />
            <nav className="collection-tabs flex shrink-0 items-center gap-6 max-[769px]:gap-5 ml-auto max-[769px]:ml-0 max-[769px]:pt-0.5 max-[769px]:pb-1" aria-label="Recipe collections">
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center p-0 pt-1 pb-1.5 border-0 border-b-2 bg-transparent text-[13px] font-medium leading-[1.4] whitespace-nowrap cursor-pointer transition-colors",
                  collection === "all"
                    ? "active border-ink text-ink font-semibold"
                    : "border-transparent text-muted hover:text-ink"
                )}
                aria-pressed={collection === "all"}
                onClick={() => set({ collection: "all" })}
              >
                All recipes
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center justify-center p-0 pt-1 pb-1.5 border-0 border-b-2 bg-transparent text-[13px] font-medium leading-[1.4] whitespace-nowrap cursor-pointer transition-colors",
                  collection === "favorites"
                    ? "active border-ink text-ink font-semibold"
                    : "border-transparent text-muted hover:text-ink"
                )}
                aria-pressed={collection === "favorites"}
                onClick={() => set({ collection: "favorites" })}
              >
                Favorites
              </button>
            </nav>
          </div>
          <div className="category-panel flex max-[769px]:flex-col items-center max-[769px]:items-stretch justify-between gap-4 max-[769px]:gap-3 mt-3.5 max-[769px]:mt-3">
            <nav className="category-nav flex flex-wrap max-[769px]:flex-nowrap items-center gap-2 m-0 p-0 max-[769px]:overflow-x-auto max-[769px]:px-0.5 max-[769px]:pt-1 max-[769px]:pb-2 max-[769px]:[scrollbar-width:none] max-[769px]:[&::-webkit-scrollbar]:hidden" aria-label="Recipe categories">
              <button
                type="button"
                className={cn(
                  "category-pill inline-flex shrink-0 items-center justify-center gap-1.5 h-8 min-h-[32px] px-3.5 border rounded-[4px] text-[11.5px] font-semibold leading-none tracking-[0.04em] uppercase whitespace-nowrap cursor-pointer transition-all",
                  !category
                    ? "active border-ink bg-ink text-white"
                    : "border-ink/15 bg-white text-ink hover:border-[#aebcb2] hover:bg-[#faf8f5]"
                )}
                aria-pressed={!category}
                onClick={() => set({ category: "" })}
              >
                All
              </button>
              {categories.map(([name, count]) => {
                const isActive = category === name;
                return (
                  <button
                    type="button"
                    key={name}
                    className={cn(
                      "category-pill inline-flex shrink-0 items-center justify-center gap-1.5 h-8 min-h-[32px] px-3.5 border rounded-[4px] text-[11.5px] font-semibold leading-none tracking-[0.04em] uppercase whitespace-nowrap cursor-pointer transition-all",
                      isActive
                        ? "active border-ink bg-ink text-white"
                        : "border-ink/15 bg-white text-ink hover:border-[#aebcb2] hover:bg-[#faf8f5]"
                    )}
                    aria-pressed={isActive}
                    onClick={() => set({ category: name })}
                  >
                    {name}
                    {Boolean(count) && (
                      <span className={cn("category-pill__count ml-0.5 text-[10px] font-medium opacity-60", isActive && "text-white opacity-85")}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <label className="sort-control inline-flex shrink-0 items-center max-[769px]:justify-end ml-auto">
              <span className="sr-only">Sort recipes</span>
              <select
                className="h-8 min-h-[32px] pl-1.5 pr-4 border-0 outline-none bg-transparent text-muted hover:text-ink text-[11px] font-semibold tracking-[0.05em] uppercase cursor-pointer transition-colors"
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
          <div className="results-bar flex items-center justify-between gap-4 min-h-[40px] mb-5">
            <p aria-live="polite" className="flex items-center gap-2.5 m-0 text-muted text-[13px]">
              <strong className="text-ink font-semibold">
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
                className="filter-chip inline-flex items-center gap-1.5 px-2.5 py-1 border border-terracotta/30 rounded-[4px] bg-transparent text-terracotta text-[11px] font-medium cursor-pointer hover:bg-terracotta/10 transition-colors"
                onClick={() => set({ category: "" })}
              >
                Clear {category}
                <X size={13} />
              </button>
            )}
          </div>
        )}
        {results.length ? (
          <div className="recipe-grid--shelf grid grid-cols-3 max-[1151px]:grid-cols-2 max-[601px]:grid-cols-1 gap-[32px_24px] max-[1151px]:gap-[28px_18px] max-[601px]:gap-5 w-full">
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
          <div className="empty-state flex flex-col items-center pt-[76px] px-[22px] pb-[100px] text-muted text-center">
            <BookOpen size={38} strokeWidth={1.2} className="text-muted" />
            <h2 className="font-serif font-normal text-[30px] leading-[1.2] text-ink my-6 mb-3">
              {collection === "favorites" && !query && !category
                ? "A shelf for your favorites."
                : "Nothing on the shelf. Yet."}
            </h2>
            <p className="max-w-[390px] text-sm leading-[1.6] text-muted mb-2.5">
              {collection === "favorites" && !query && !category
                ? "Save a recipe with the bookmark to keep it here."
                : "Try another ingredient, or clear your filters."}
            </p>
            <Button
              variant="light"
              size="default"
              className="mt-2.5"
              onClick={() =>
                set({ query: "", category: "", collection: "all" })
              }
            >
              Browse all recipes
            </Button>
          </div>
        )}
        <div className="shelf-footnote flex items-center gap-3 pt-[34px] pb-1 text-muted text-[11px] leading-[1.7]">
          <span className="little-rule inline-block w-[23px] h-px bg-current shrink-0" />
          {recipes.some((recipe) => recipe.example)
            ? "Starter recipes are here to try. Your own recipes belong right alongside them."
            : "Your collection, one recipe at a time."}
        </div>
      </section>
    </main>
  );
}
