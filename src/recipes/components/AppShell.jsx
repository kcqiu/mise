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
      <div className="app-header w-[min(1312px,calc(100%-48px))] min-[1500px]:w-[min(1360px,calc(100%-160px))] max-[1150px]:w-[calc(100%-72px)] max-[800px]:w-[calc(100%-48px)] max-[580px]:w-[calc(100%-36px)] mx-auto h-[76px] max-[800px]:h-[82px] max-[580px]:h-[77px] max-[580px]:gap-4 flex items-center justify-between">
        <a
          href="#/"
          className="mise-brand font-serif text-[42px] max-[580px]:text-[38px] font-medium leading-[0.9] text-ink pb-1 no-underline inline-block"
          aria-label="mise. recipe shelf"
        >
          mise<span className="text-terracotta">.</span>
        </a>

        <div className="header-actions ml-auto flex items-center gap-4 max-[580px]:gap-[5px]">
          <a
            href="#/groceries"
            className={cn(
              "groceries-nav-btn relative inline-flex items-center gap-2 px-2 py-1.5 text-sm font-medium transition-colors no-underline max-[580px]:justify-center max-[580px]:w-10 max-[580px]:h-10 max-[580px]:min-h-10 max-[580px]:p-0",
              route === "groceries"
                ? "is-active text-ink font-semibold"
                : "text-ink hover:text-[#55534c] font-medium"
            )}
            aria-label={`Grocery list${groceryRecipeCount ? ` (${groceryRecipeCount} recipes)` : ""}`}
            title="Open grocery list"
          >
            <ShoppingBag size={17} />
            <span className="groceries-nav-label max-[580px]:hidden">Grocery list</span>
            {Boolean(groceryRecipeCount) && (
              <span className="groceries-badge inline-flex items-center justify-center min-w-[18px] h-[18px] px-[5px] rounded-full bg-accent text-white text-[11px] font-bold leading-none ml-0.5 max-[580px]:absolute max-[580px]:-top-1 max-[580px]:-right-1 max-[580px]:min-w-4 max-[580px]:h-4 max-[580px]:m-0 max-[580px]:px-1 max-[580px]:text-[10px]">
                {groceryRecipeCount}
              </span>
            )}
          </a>

          <button
            type="button"
            className="button add-recipe-button inline-flex items-center gap-[7px] max-[580px]:gap-1.5 px-[18px] max-[580px]:px-2.5 py-[9px] max-[580px]:py-2 rounded-[6px] bg-[#24231f] hover:bg-[#383630] active:bg-[#181714] text-white text-sm max-[580px]:text-[11.5px] font-semibold transition-colors cursor-pointer border border-[#24231f] max-[580px]:min-h-10 max-[370px]:w-11 max-[370px]:h-11 max-[370px]:p-0"
            aria-label="Add recipe"
            onClick={onAddRecipe}
          >
            <Plus size={17} />
            <span className="max-[370px]:hidden">Add recipe</span>
          </button>

          {cloudAvailable &&
            (account.session ? (
              <details ref={accountMenuRef} className="account-menu relative">
                <summary
                  className="account-chip inline-flex items-center gap-2 min-h-10 px-1 py-0 max-w-[180px] rounded-[4px] border-0 bg-transparent hover:bg-transparent hover:opacity-80 cursor-pointer text-sm font-medium transition-opacity list-none select-none shadow-none [&::-webkit-details-marker]:hidden max-[580px]:justify-center max-[580px]:w-10 max-[580px]:h-10 max-[580px]:min-h-10 max-[580px]:p-[3px]"
                  aria-label="Open account menu"
                  title={account.session.user.email}
                >
                  <img
                    className="account-avatar-img w-8 h-8 rounded-full object-cover shrink-0"
                    src={
                      account.session.user.user_metadata?.avatar_url ||
                      "/recipe/art/avatar-mara.webp"
                    }
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-ink text-sm font-medium truncate max-[580px]:hidden">
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
                className="account-sign-in inline-flex items-center gap-2 min-h-10 py-0 px-1 rounded-[4px] border-0 bg-transparent hover:bg-transparent hover:opacity-80 text-[14px] leading-[1.5] font-medium text-ink shadow-none transition-opacity cursor-pointer max-[580px]:justify-center max-[580px]:w-[38px] max-[580px]:h-[38px] max-[580px]:min-h-[38px] max-[580px]:p-0"
                onClick={onSignIn}
                disabled={account.loading}
                aria-label="Sign in"
                title="Sign in"
              >
                <span className="account-sign-in__icon flex items-center justify-center w-8 h-8 rounded-full bg-ink/[0.08] text-ink shrink-0 transition-colors" aria-hidden="true">
                  <UserRound size={17} strokeWidth={1.8} />
                </span>
                <span className="text-[14px] leading-[1.5] font-medium max-[580px]:hidden">
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
    <footer className="app-footer border-t border-line text-[#798577] flex items-center gap-7 min-h-[108px] mt-[72px] max-[800px]:mt-12 w-[min(1312px,calc(100%-48px))] min-[1500px]:w-[min(1360px,calc(100%-160px))] max-[1150px]:w-[calc(100%-72px)] max-[800px]:w-[calc(100%-48px)] max-[580px]:w-[calc(100%-36px)] mx-auto">
      <a href="#/" className="mise-brand text-ink text-[31px] font-serif font-medium leading-[0.9] pb-1 no-underline">
        mise<span className="text-terracotta">.</span>
      </a>
      <span className="text-[11px]">A little less searching. A little more cooking.</span>
      <Sprout size={23} strokeWidth={1.3} aria-hidden="true" className="ml-auto" />
    </footer>
  );
}
