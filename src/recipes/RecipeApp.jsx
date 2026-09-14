import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Download,
  MoreHorizontal,
  Plus,
  Sprout,
  Upload,
  X,
} from "lucide-react";
import publishedRecipes from "./data/recipes.json";
import {
  getCategories,
  parseBackup,
  readLibrary,
  STORAGE_KEY,
} from "./library";
import RecipeLibrary from "./components/RecipeLibrary";
import RecipeDetail from "./components/RecipeDetail";
import RecipeEditor from "./components/RecipeEditor";

function readRoute() {
  const path = window.location.hash.slice(1);
  if (!path || path === "/") return "";
  return /^\/recipe\/[a-zA-Z0-9_-]+$/.test(path) ? path.slice(8) : "not-found";
}

export default function RecipeApp() {
  const [initial] = useState(readLibrary);
  const [library, setLibrary] = useState(initial.library);
  const [notice, setNotice] = useState(initial.error);
  const [route, setRoute] = useState(readRoute);
  const [shelfState, setShelfState] = useState({
    query: "",
    category: "",
    collection: "all",
    sort: "collection",
  });
  const [editor, setEditor] = useState(null);
  const importInput = useRef(null);
  const toolsMenu = useRef(null);
  const recipes = useMemo(
    () => [
      ...new Map(
        [...publishedRecipes, ...library.recipes].map((recipe) => [
          recipe.id,
          recipe,
        ]),
      ).values(),
    ],
    [library.recipes],
  );
  const current = recipes.find((recipe) => recipe.id === route);

  useEffect(() => {
    const change = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.title = current
      ? `${current.title} | mise.`
      : "mise. | The recipe shelf";
  }, [current]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === STORAGE_KEY) {
        const latest = readLibrary();
        setLibrary(latest.library);
        if (latest.error) setNotice(latest.error);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const commit = (next) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLibrary(next);
      return "";
    } catch {
      const message =
        "Your browser couldn't save this change. Free up some storage or export a backup before trying again.";
      setNotice(message);
      return message;
    }
  };
  const favorite = (id) =>
    commit({
      ...library,
      favorites: library.favorites.includes(id)
        ? library.favorites.filter((value) => value !== id)
        : [...library.favorites, id],
    });
  const save = (recipe) => {
    for (const key of [
      "tags",
      "keywords",
      "notes",
      "substitutions",
      "equipment",
    ])
      recipe[key] = recipe[key].map((item) => item.trim()).filter(Boolean);
    const progress = { ...library.progress };
    delete progress[recipe.id];
    const error = commit({
      ...library,
      recipes: [
        ...library.recipes.filter((item) => item.id !== recipe.id),
        recipe,
      ],
      progress,
    });
    if (!error) {
      setEditor(null);
      setNotice("Recipe saved on this browser.");
      window.location.hash = `/recipe/${recipe.id}`;
    }
    return error;
  };
  const remove = (id) => {
    const progress = { ...library.progress };
    delete progress[id];
    const error = commit({
      ...library,
      recipes: library.recipes.filter((recipe) => recipe.id !== id),
      favorites: library.favorites.filter((value) => value !== id),
      progress,
    });
    if (!error) {
      setEditor(null);
      window.location.hash = "/";
      setNotice("Recipe removed from this browser.");
    }
  };
  const exportLibrary = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { version: 1, recipes, favorites: library.favorites },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `mise-recipes-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toolsMenu.current.open = false;
  };
  const importLibrary = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("Please choose a JSON backup smaller than 2 MB.");
      const backup = parseBackup(await file.text());
      const merged = [
        ...new Map(
          [...library.recipes, ...backup.recipes].map((recipe) => [
            recipe.id,
            recipe,
          ]),
        ).values(),
      ];
      const progress = { ...library.progress };
      backup.recipes.forEach((recipe) => delete progress[recipe.id]);
      const error = commit({
        ...library,
        recipes: merged,
        favorites: [...new Set([...library.favorites, ...backup.favorites])],
        progress,
      });
      if (!error)
        setNotice(
          `Imported ${backup.recipes.length} recipes. Matching recipe ids were updated.`,
        );
    } catch (error) {
      setNotice(
        error instanceof SyntaxError
          ? "That file isn't valid JSON. Choose a mise. backup or a recipe content file."
          : error.message,
      );
    }
  };
  return (
    <div className="recipe-app">
      <a
        href="#recipe-main"
        className="recipe-skip"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("recipe-main")?.focus();
        }}
      >
        Skip to recipes
      </a>
      <header className="app-header">
        <a href="#/" className="mise-brand" aria-label="mise. recipe shelf">
          mise<span>.</span>
        </a>
        <span className="header-caption">Recipes, kept close.</span>
        <div className="header-actions">
          <details
            ref={toolsMenu}
            className="library-tools"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
          >
            <summary
              className="icon-button"
              aria-label="Library backups"
              title="Import or export recipes"
            >
              <MoreHorizontal size={22} />
            </summary>
            <div className="tools-menu">
              <span className="eyebrow">Your recipe backup</span>
              <button onClick={exportLibrary}>
                <Download size={17} />
                Export recipes
              </button>
              <button
                onClick={() => {
                  importInput.current.click();
                  toolsMenu.current.open = false;
                }}
              >
                <Upload size={17} />
                Import recipes
              </button>
              <p>
                Browser-saved recipes stay on this device. A backup travels with
                you.
              </p>
            </div>
          </details>
          <button
            className="button add-recipe-button"
            aria-label="Add recipe"
            onClick={() => setEditor({ recipe: null })}
          >
            <Plus size={17} />
            <span>Add recipe</span>
          </button>
        </div>
        <input
          ref={importInput}
          className="sr-only"
          type="file"
          accept=".json,application/json"
          aria-label="Import recipe backup"
          tabIndex={-1}
          onChange={importLibrary}
        />
      </header>
      {notice && (
        <div className="app-notice" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {route ? (
        current ? (
          <RecipeDetail
            key={current.id}
            recipe={current}
            favorite={library.favorites.includes(current.id)}
            onFavorite={favorite}
            progress={library.progress[current.id]}
            onProgress={(progress) =>
              commit({
                ...library,
                progress: { ...library.progress, [current.id]: progress },
              })
            }
            onEdit={(recipe) => setEditor({ recipe })}
            isLocal={library.recipes.some((recipe) => recipe.id === current.id)}
          />
        ) : (
          <main
            className="empty-state missing-recipe"
            id="recipe-main"
            tabIndex={-1}
          >
            <BookOpen size={40} strokeWidth={1.2} />
            <h1>This recipe isn't on the shelf.</h1>
            <p>
              It may be saved on another device. Import your backup to bring it
              here.
            </p>
            <a className="button" href="#/">
              <ArrowLeft size={16} />
              Back to recipes
            </a>
          </main>
        )
      ) : (
        <RecipeLibrary
          recipes={recipes}
          favorites={library.favorites}
          onFavorite={favorite}
          state={shelfState}
          onState={setShelfState}
          onAdd={() => setEditor({ recipe: null })}
        />
      )}
      <footer className="app-footer">
        <a href="#/" className="mise-brand">
          mise<span>.</span>
        </a>
        <span>A little less searching. A little more cooking.</span>
        <Sprout size={23} strokeWidth={1.3} aria-hidden="true" />
      </footer>
      {editor && (
        <RecipeEditor
          recipe={editor.recipe}
          categories={getCategories(recipes).map(([name]) => name)}
          isLocal={
            !!editor.recipe &&
            library.recipes.some((recipe) => recipe.id === editor.recipe.id)
          }
          onSave={save}
          onDelete={remove}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
