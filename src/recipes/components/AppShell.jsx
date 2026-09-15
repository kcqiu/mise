import {
  Cloud,
  LogOut,
  Plus,
  ShoppingBag,
  Sprout,
  UserRound,
} from "lucide-react";

export function AppHeader({
  account,
  accountMenuRef,
  cloudAvailable,
  favoriteCount,
  groceryRecipeCount,
  importInputRef,
  onAddRecipe,
  onImportRecipeFile,
  onSignIn,
  onSignOut,
  personalRecipeCount,
  route,
}) {
  return (
    <header className="app-header-wrap">
      <div className="app-header">
        <a href="#/" className="mise-brand" aria-label="mise. recipe shelf">
          mise<span>.</span>
        </a>
        <span className="header-caption">Recipes, kept close.</span>
        <div className="header-actions">
          <a
            href="#/groceries"
            className={`groceries-nav-btn ${route === "groceries" ? "is-active" : ""}`}
            aria-label={`Grocery list${groceryRecipeCount ? ` (${groceryRecipeCount} recipes)` : ""}`}
            title="Open grocery list"
          >
            <ShoppingBag size={17} />
            <span className="groceries-nav-label">Grocery list</span>
            {Boolean(groceryRecipeCount) && (
              <span className="groceries-badge">{groceryRecipeCount}</span>
            )}
          </a>

          <button
            className="button add-recipe-button"
            aria-label="Add recipe"
            onClick={onAddRecipe}
          >
            <Plus size={17} />
            <span>Add recipe</span>
          </button>

          {cloudAvailable &&
            (account.session ? (
              <details ref={accountMenuRef} className="account-menu">
                <summary
                  className="account-chip"
                  aria-label="Open account menu"
                  title={account.session.user.email}
                >
                  <img
                    className="account-avatar-img"
                    src={
                      account.session.user.user_metadata?.avatar_url ||
                      "/recipe/art/avatar-mara.webp"
                    }
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                  <span>
                    {account.session.user.user_metadata?.name || "Mara"}
                  </span>
                </summary>
                <div className="tools-menu account-menu__panel">
                  <span className="eyebrow">
                    <Cloud size={13} /> Synced library
                  </span>
                  <strong>
                    {account.session.user.user_metadata?.name || "Mara"}
                  </strong>
                  <small>{account.session.user.email}</small>
                  <div className="account-stats-pills">
                    <span>
                      {personalRecipeCount}{" "}
                      {personalRecipeCount === 1 ? "recipe" : "recipes"}
                    </span>
                    <span>
                      {favoriteCount}{" "}
                      {favoriteCount === 1 ? "favorite" : "favorites"}
                    </span>
                  </div>
                  <button onClick={onSignOut}>
                    <LogOut size={17} /> Sign out
                  </button>
                </div>
              </details>
            ) : (
              <button
                className="account-sign-in"
                onClick={onSignIn}
                disabled={account.loading}
                aria-label="Sign in"
                title="Sign in"
              >
                <span className="account-sign-in__icon" aria-hidden="true">
                  <UserRound size={17} strokeWidth={1.8} />
                </span>
                <span>{account.loading ? "Connecting" : "Sign in"}</span>
              </button>
            ))}
        </div>
      </div>
      <input
        ref={importInputRef}
        className="sr-only"
        type="file"
        accept=".json,application/json,.txt,.md,text/plain,text/markdown"
        aria-label="Import recipe file or backup"
        tabIndex={-1}
        onChange={onImportRecipeFile}
      />
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="app-footer border-t border-line text-[#798577] flex items-center gap-7 min-h-[108px] mt-[72px] w-[min(1312px,calc(100%-48px))] mx-auto">
      <a href="#/" className="mise-brand text-ink text-[31px] font-serif font-medium leading-[0.9] pb-1 no-underline">
        mise<span className="text-terracotta">.</span>
      </a>
      <span className="text-[11px]">A little less searching. A little more cooking.</span>
      <Sprout size={23} strokeWidth={1.3} aria-hidden="true" className="ml-auto" />
    </footer>
  );
}
