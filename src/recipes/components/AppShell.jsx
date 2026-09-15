import {
  Cloud,
  LogOut,
  Plus,
  ShoppingBag,
  Sprout,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    <header className="app-header-wrap sticky top-0 z-[90] w-full bg-[rgba(242,238,229,0.82)] backdrop-blur-[20px] backdrop-saturate-[180%] border-b border-[rgba(36,35,31,0.08)] shadow-[0_4px_20px_-2px_rgba(36,35,31,0.04)] transition-colors duration-200">
      <div className="app-header w-[min(1312px,calc(100%-48px))] mx-auto h-[76px] flex items-center justify-between">
        <div className="flex items-center">
          <a
            href="#/"
            className="mise-brand font-serif text-[42px] font-medium leading-[0.9] text-ink pb-1 no-underline inline-block"
            aria-label="mise. recipe shelf"
          >
            mise<span className="text-terracotta">.</span>
          </a>
          <span className="header-caption hidden min-[901px]:inline text-xs text-muted ml-6">
            Recipes, kept close.
          </span>
        </div>

        <div className="header-actions ml-auto flex items-center gap-3 sm:gap-4">
          <a
            href="#/groceries"
            className={cn(
              "groceries-nav-btn relative inline-flex items-center gap-2 px-2 py-1.5 text-sm transition-colors no-underline",
              route === "groceries"
                ? "is-active text-ink font-semibold"
                : "text-ink hover:text-[#55534c] font-medium"
            )}
            aria-label={`Grocery list${groceryRecipeCount ? ` (${groceryRecipeCount} recipes)` : ""}`}
            title="Open grocery list"
          >
            <ShoppingBag size={17} />
            <span className="groceries-nav-label hidden min-[581px]:inline">Grocery list</span>
            {Boolean(groceryRecipeCount) && (
              <span className="groceries-badge inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-bold leading-none ml-0.5">
                {groceryRecipeCount}
              </span>
            )}
          </a>

          <button
            type="button"
            className="button add-recipe-button inline-flex items-center gap-[7px] px-[18px] py-[9px] rounded-[6px] bg-[#24231f] hover:bg-[#383630] active:bg-[#181714] text-white text-sm font-semibold transition-colors cursor-pointer border border-[#24231f]"
            aria-label="Add recipe"
            onClick={onAddRecipe}
          >
            <Plus size={17} />
            <span className="hidden min-[481px]:inline">Add recipe</span>
          </button>

          {cloudAvailable &&
            (account.session ? (
              <details ref={accountMenuRef} className="account-menu relative">
                <summary
                  className="account-chip inline-flex items-center gap-2 py-1 pr-2.5 pl-1 rounded-full border border-line bg-white/60 hover:bg-white hover:border-[#bdcdb7] cursor-pointer text-[13px] font-medium transition-colors list-none select-none [&::-webkit-details-marker]:hidden"
                  aria-label="Open account menu"
                  title={account.session.user.email}
                >
                  <img
                    className="account-avatar-img w-[30px] h-[30px] rounded-full object-cover shrink-0"
                    src={
                      account.session.user.user_metadata?.avatar_url ||
                      "/recipe/art/avatar-mara.webp"
                    }
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                  <span className="hidden min-[581px]:inline text-ink">
                    {account.session.user.user_metadata?.name || "Mara"}
                  </span>
                </summary>
                <div className="tools-menu account-menu__panel absolute right-0 top-full mt-2 w-64 p-4 rounded-xl bg-white shadow-xl border border-line flex flex-col gap-2 z-50">
                  <span className="eyebrow flex items-center gap-2 text-[10px] font-semibold uppercase text-muted tracking-wider">
                    <Cloud size={13} /> Synced library
                  </span>
                  <strong className="text-sm font-bold text-ink truncate">
                    {account.session.user.user_metadata?.name || "Mara"}
                  </strong>
                  <small className="text-xs text-muted truncate">
                    {account.session.user.email}
                  </small>
                  <div className="account-stats-pills flex gap-1.5 my-2">
                    <span className="text-[11px] font-semibold text-ink bg-[#ebf2eb] px-2.5 py-0.5 rounded-full">
                      {personalRecipeCount}{" "}
                      {personalRecipeCount === 1 ? "recipe" : "recipes"}
                    </span>
                    <span className="text-[11px] font-semibold text-ink bg-[#ebf2eb] px-2.5 py-0.5 rounded-full">
                      {favoriteCount}{" "}
                      {favoriteCount === 1 ? "favorite" : "favorites"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="flex items-center gap-2.5 w-full min-h-[40px] px-2 text-left text-[13px] font-medium text-ink hover:bg-paper rounded-md transition-colors cursor-pointer border-0 bg-transparent"
                  >
                    <LogOut size={17} /> Sign out
                  </button>
                </div>
              </details>
            ) : (
              <button
                type="button"
                className="account-sign-in inline-flex items-center gap-2 py-2 px-3.5 rounded-full border border-line bg-white/60 hover:bg-white text-xs font-medium text-ink transition-colors cursor-pointer"
                onClick={onSignIn}
                disabled={account.loading}
                aria-label="Sign in"
                title="Sign in"
              >
                <span className="account-sign-in__icon shrink-0" aria-hidden="true">
                  <UserRound size={17} strokeWidth={1.8} />
                </span>
                <span className="hidden min-[581px]:inline">
                  {account.loading ? "Connecting" : "Sign in"}
                </span>
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
