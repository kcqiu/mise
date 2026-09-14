import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Cloud,
  Download,
  LogIn,
  LogOut,
  MoreHorizontal,
  Plus,
  Sprout,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import publishedRecipes from "./data/recipes.json";
import {
  getCategories,
  EMPTY_LIBRARY,
  parseBackup,
  readLibrary,
  STORAGE_KEY,
} from "./library";
import {
  cloudEnabled,
  deleteAccountRecipe,
  extractAuthErrorFromUrl,
  getSession,
  importAccountLibrary,
  loadAccountLibrary,
  saveAccountRecipe,
  setAccountFavorite,
  setAccountProgress,
  signInWithGoogle,
  signInWithGoogleIdToken,
  signOut,
  watchSession,
} from "./cloud";
import RecipeLibrary from "./components/RecipeLibrary";
import RecipeDetail from "./components/RecipeDetail";
import RecipeEditor from "./components/RecipeEditor";
import AddRecipeModal from "./components/AddRecipeModal";
import AuthModal from "./components/AuthModal";
import ToastStack from "./components/ToastStack";

function readRoute() {
  const path = window.location.hash.slice(1);
  if (!path || path === "/" || path === "/login") return "";
  return /^\/recipe\/[a-zA-Z0-9_-]+$/.test(path) ? path.slice(8) : "not-found";
}

export default function RecipeApp() {
  const [initial] = useState(readLibrary);
  const [library, setLibrary] = useState(initial.library);
  const libraryRef = useRef(initial.library);
  const [account, setAccount] = useState({
    session: null,
    library: EMPTY_LIBRARY,
    loading: cloudEnabled,
  });
  const [notice, setNotice] = useState(initial.error);
  const [toasts, setToasts] = useState(() =>
    initial.error
      ? [{ id: "init", message: initial.error, type: "error" }]
      : [],
  );
  const [authModal, setAuthModal] = useState({
    open: typeof window !== "undefined" && window.location.hash === "#/login",
    intent: "signin",
    error: "",
  });
  const [route, setRoute] = useState(readRoute);
  const [shelfState, setShelfState] = useState({
    query: "",
    category: "",
    collection: "all",
    sort: "collection",
  });
  const [editor, setEditor] = useState(null);
  const [addRecipeModalOpen, setAddRecipeModalOpen] = useState(false);
  const importInput = useRef(null);
  const toolsMenu = useRef(null);
  const accountMenu = useRef(null);
  const activeLibrary = account.session ? account.library : library;
  const personalRecipes = account.session
    ? account.library.recipes
    : library.recipes;
  const recipes = useMemo(
    () => [
      ...new Map(
        [...publishedRecipes, ...personalRecipes].map((recipe) => [
          recipe.id,
          recipe,
        ]),
      ).values(),
    ],
    [personalRecipes],
  );
  const current = recipes.find((recipe) => recipe.id === route);

  const addToast = (message, type = "info", title = "") => {
    if (!message) return;
    setToasts((prev) => [
      ...prev.slice(-4),
      {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        message,
        type,
        title,
      },
    ]);
  };
  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const authErr = extractAuthErrorFromUrl();
    if (authErr) {
      setAuthModal({ open: true, intent: "signin", error: authErr });
      addToast(authErr, "error", "Sign-in Notice");
    }
  }, []);

  useEffect(() => {
    if (window.location.hash === "#/login") {
      setAuthModal((prev) => ({ ...prev, open: true, intent: "signin" }));
    }
  }, [route]);

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
    libraryRef.current = library;
  }, [library]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === STORAGE_KEY) {
        const latest = readLibrary();
        setLibrary(latest.library);
        if (latest.error) {
          setNotice(latest.error);
          addToast(latest.error, "error");
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return undefined;
    let active = true;
    const hydrate = async (session) => {
      if (!active) return;
      if (!session) {
        setAccount({ session: null, library: EMPTY_LIBRARY, loading: false });
        return;
      }
      setAuthModal((prev) => ({ ...prev, open: false, error: "" }));
      setAccount((current) => ({ ...current, session, loading: true }));
      try {
        const pending = libraryRef.current;
        const hasLocalData =
          pending.recipes.length > 0 ||
          pending.favorites.length > 0 ||
          Object.keys(pending.progress).length > 0;
        if (hasLocalData) {
          await importAccountLibrary(session.user.id, pending);
          window.localStorage.removeItem(STORAGE_KEY);
          libraryRef.current = EMPTY_LIBRARY;
          if (active) {
            setLibrary(EMPTY_LIBRARY);
            const msg = "Your browser recipes are now synced to this account.";
            setNotice(msg);
            addToast(msg, "cloud", "Synced");
          }
        }
        const remote = await loadAccountLibrary(session.user.id);
        if (active) setAccount({ session, library: remote, loading: false });
      } catch (error) {
        if (active) {
          setAccount((current) => ({ ...current, loading: false }));
          const msg = `Your account connected, but recipes could not sync: ${error.message}`;
          setNotice(msg);
          addToast(msg, "error");
        }
      }
    };
    getSession()
      .then(hydrate)
      .catch((error) => {
        if (active) {
          setAccount({ session: null, library: EMPTY_LIBRARY, loading: false });
          const msg = `Sign-in could not be restored: ${error.message}`;
          setNotice(msg);
          addToast(msg, "error");
        }
      });
    const stopWatching = watchSession(hydrate);
    return () => {
      active = false;
      stopWatching();
    };
  }, []);

  const commitLocal = (next) => {
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
  const favorite = async (id) => {
    if (cloudEnabled && !account.session) {
      setAuthModal({
        open: true,
        intent: "favorite",
        error: "",
      });
      return;
    }
    const wasFavorite = activeLibrary.favorites.includes(id);
    const favorites = wasFavorite
      ? activeLibrary.favorites.filter((value) => value !== id)
      : [...activeLibrary.favorites, id];
    if (!account.session) {
      commitLocal({ ...library, favorites });
      return;
    }
    setAccount((current) => ({
      ...current,
      library: { ...current.library, favorites },
    }));
    try {
      await setAccountFavorite(account.session.user.id, id, !wasFavorite);
    } catch (error) {
      setAccount((current) => ({
        ...current,
        library: { ...current.library, favorites: activeLibrary.favorites },
      }));
      const msg = `Favorite could not sync: ${error.message}`;
      setNotice(msg);
      addToast(msg, "error");
    }
  };
  const save = async (recipe) => {
    for (const key of [
      "tags",
      "keywords",
      "notes",
      "substitutions",
      "equipment",
    ])
      recipe[key] = recipe[key].map((item) => item.trim()).filter(Boolean);
    const progress = { ...activeLibrary.progress };
    delete progress[recipe.id];
    const nextRecipes = [
      ...personalRecipes.filter((item) => item.id !== recipe.id),
      recipe,
    ];
    if (account.session) {
      try {
        await saveAccountRecipe(account.session.user.id, recipe);
        setAccount((current) => ({
          ...current,
          library: { ...current.library, recipes: nextRecipes, progress },
        }));
        setEditor(null);
        setNotice("Recipe saved to your account.");
        addToast("Recipe saved to your account.", "success");
        window.location.hash = `/recipe/${recipe.id}`;
        return "";
      } catch (error) {
        const message = `Recipe could not sync: ${error.message}`;
        setNotice(message);
        addToast(message, "error");
        return message;
      }
    }
    const error = commitLocal({ ...library, recipes: nextRecipes, progress });
    if (!error) {
      setEditor(null);
      setNotice("Recipe saved on this browser.");
      addToast("Recipe saved on this browser.", "success");
      window.location.hash = `/recipe/${recipe.id}`;
    }
    return error;
  };
  const remove = async (id) => {
    const progress = { ...activeLibrary.progress };
    delete progress[id];
    const next = {
      ...activeLibrary,
      recipes: personalRecipes.filter((recipe) => recipe.id !== id),
      favorites: activeLibrary.favorites.filter((value) => value !== id),
      progress,
    };
    if (account.session) {
      try {
        await deleteAccountRecipe(account.session.user.id, id);
        setAccount((current) => ({ ...current, library: next }));
        setEditor(null);
        window.location.hash = "/";
        setNotice("Recipe removed from your account.");
        addToast("Recipe removed from your account.", "info");
        return "";
      } catch (error) {
        const message = `Recipe could not be removed: ${error.message}`;
        setNotice(message);
        addToast(message, "error");
        return message;
      }
    }
    const error = commitLocal(next);
    if (!error) {
      setEditor(null);
      window.location.hash = "/";
      setNotice("Recipe removed from this browser.");
      addToast("Recipe removed from this browser.", "info");
    }
  };
  const exportLibrary = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 1,
              recipes: personalRecipes,
              favorites: activeLibrary.favorites,
            },
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
      if (account.session) {
        const systemIds = new Set(publishedRecipes.map(({ id }) => id));
        const personalBackup = {
          ...backup,
          recipes: backup.recipes.filter(({ id }) => !systemIds.has(id)),
        };
        await importAccountLibrary(account.session.user.id, {
          ...personalBackup,
          progress: {},
        });
        const remote = await loadAccountLibrary(account.session.user.id);
        setAccount((current) => ({ ...current, library: remote }));
        const msg = `Imported ${personalBackup.recipes.length} personal recipes to your account.`;
        setNotice(msg);
        addToast(msg, "success");
        return;
      }
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
      const error = commitLocal({
        ...library,
        recipes: merged,
        favorites: [...new Set([...library.favorites, ...backup.favorites])],
        progress,
      });
      if (!error) {
        const msg = `Imported ${backup.recipes.length} recipes. Matching recipe ids were updated.`;
        setNotice(msg);
        addToast(msg, "success");
      }
    } catch (error) {
      const msg =
        error instanceof SyntaxError
          ? "That file isn't valid JSON. Choose a mise. backup or a recipe content file."
          : error.message;
      setNotice(msg);
      addToast(msg, "error");
    }
  };
  const handleAddRecipeClick = () => {
    if (cloudEnabled && !account.session) {
      setAuthModal({
        open: true,
        intent: "create",
        error: "",
      });
      setNotice("Sign in with Google to create and manage your recipes.");
      return;
    }
    setAddRecipeModalOpen(true);
  };
  const openEditor = (recipe = null) => {
    if (cloudEnabled && !account.session) {
      setAuthModal({
        open: true,
        intent: "create",
        error: "",
      });
      setNotice("Sign in with Google to create and manage your recipes.");
      return;
    }
    setEditor({ recipe });
  };
  const beginSignIn = () => {
    setAuthModal({ open: true, intent: "signin", error: "" });
  };
  const handleAuthModalSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthModal((prev) => ({ ...prev, error: error.message }));
      addToast(`Google sign-in could not start: ${error.message}`, "error");
    }
  };
  const handleAuthModalSignInWithIdToken = async (idToken) => {
    try {
      setAccount((prev) => ({ ...prev, loading: true }));
      const result = await signInWithGoogleIdToken(idToken);
      if (result?.session) {
        setAuthModal({ open: false, intent: "signin", error: "" });
        addToast("Signed in to your cookbook shelf!", "success", "Welcome");
      }
    } catch (error) {
      setAccount((prev) => ({ ...prev, loading: false }));
      const msg = error.message || "Google sign-in failed.";
      setAuthModal((prev) => ({ ...prev, error: msg }));
      addToast(`Sign-in error: ${msg}`, "error");
    }
  };
  const closeAuthModal = () => {
    setAuthModal((prev) => ({ ...prev, open: false, error: "" }));
    if (window.location.hash === "#/login") {
      window.location.hash = "#/";
    }
  };
  const endSession = async () => {
    try {
      await signOut();
      accountMenu.current?.removeAttribute("open");
      setNotice("Signed out. System recipes are still available.");
      addToast("Signed out. System recipes are still available.", "info");
    } catch (error) {
      const msg = `Sign-out failed: ${error.message}`;
      setNotice(msg);
      addToast(msg, "error");
    }
  };
  const updateProgress = (recipeId, progress) => {
    if (!account.session) {
      commitLocal({
        ...library,
        progress: { ...library.progress, [recipeId]: progress },
      });
      return;
    }
    setAccount((current) => ({
      ...current,
      library: {
        ...current.library,
        progress: { ...current.library.progress, [recipeId]: progress },
      },
    }));
    setAccountProgress(account.session.user.id, recipeId, progress).catch(
      (error) => setNotice(`Cooking progress could not sync: ${error.message}`),
    );
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
          {cloudEnabled &&
            (account.session ? (
              <details ref={accountMenu} className="account-menu">
                <summary
                  className="account-chip"
                  aria-label="Open account menu"
                  title={account.session.user.email}
                >
                  {account.session.user.user_metadata?.avatar_url ? (
                    <img
                      src={account.session.user.user_metadata.avatar_url}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="account-avatar-fallback">
                      {(
                        account.session.user.user_metadata?.name ||
                        account.session.user.email ||
                        "C"
                      )
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>
                  )}
                  <span>{account.session.user.user_metadata?.name || "My account"}</span>
                </summary>
                <div className="tools-menu account-menu__panel">
                  <span className="eyebrow">
                    <Cloud size={13} /> Synced library
                  </span>
                  <strong>{account.session.user.user_metadata?.name || "Cook"}</strong>
                  <small>{account.session.user.email}</small>
                  <div className="account-stats-pills">
                    <span>
                      {personalRecipes.length}{" "}
                      {personalRecipes.length === 1 ? "recipe" : "recipes"}
                    </span>
                    <span>
                      {activeLibrary.favorites.length}{" "}
                      {activeLibrary.favorites.length === 1 ? "favorite" : "favorites"}
                    </span>
                  </div>
                  <button onClick={endSession}>
                    <LogOut size={17} /> Sign out
                  </button>
                </div>
              </details>
            ) : (
              <button
                className="button button--light account-sign-in"
                onClick={beginSignIn}
                disabled={account.loading}
              >
                <LogIn size={17} />
                <span>{account.loading ? "Connecting" : "Sign in"}</span>
              </button>
            ))}
          <button
            className="button add-recipe-button"
            aria-label="Add recipe"
            onClick={handleAddRecipeClick}
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
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <AuthModal
        isOpen={authModal.open}
        onClose={closeAuthModal}
        onSignIn={handleAuthModalSignIn}
        onSignInWithIdToken={handleAuthModalSignInWithIdToken}
        loading={account.loading}
        errorMessage={authModal.error}
        initialIntent={authModal.intent}
      />
      <AddRecipeModal
        isOpen={addRecipeModalOpen}
        onClose={() => setAddRecipeModalOpen(false)}
        onSelectManual={() => setEditor({ recipe: null })}
        onParsedRecipe={(parsedRecipe) => {
          setEditor({ recipe: parsedRecipe });
          addToast("Recipe structured with Gemini AI!", "success");
        }}
        onError={(msg) => addToast(msg, "error")}
      />
      {notice && (
        <div className="app-notice sr-only" role="status">
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
            favorite={activeLibrary.favorites.includes(current.id)}
            onFavorite={favorite}
            progress={activeLibrary.progress[current.id]}
            onProgress={(progress) => updateProgress(current.id, progress)}
            onEdit={(recipe) => openEditor(recipe)}
            isLocal={personalRecipes.some((recipe) => recipe.id === current.id)}
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
          favorites={activeLibrary.favorites}
          onFavorite={favorite}
          state={shelfState}
          onState={setShelfState}
          onAdd={handleAddRecipeClick}
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
            personalRecipes.some((recipe) => recipe.id === editor.recipe.id)
          }
          isCloud={Boolean(account.session)}
          userId={account.session?.user?.id}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
