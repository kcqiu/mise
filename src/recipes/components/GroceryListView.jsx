import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Copy,
  Minus,
  Plus,
  RefreshCw,
  Share2,
  ShoppingBag,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import RecipeArtwork from "./RecipeArtwork";
import Button from "../../components/ui/Button";
import IconButton from "../../components/ui/IconButton";
import { cn } from "@/lib/utils";
import {
  selectGroceryList,
  categorizeAisle,
  EMPTY_GROCERY_SESSION,
  resetGrocerySession,
  rolloverGrocerySession,
  generateUUID,
  formatGroceryListText,
} from "../groceries";

function useKeepAwake() {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let lock;

    const request = async () => {
      if (document.visibilityState !== "visible") return;
      if (lock && !lock.released) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (!active) {
          await next.release();
          return;
        }
        lock = next;
        next.addEventListener("release", () => {
          if (active && document.visibilityState === "visible") {
            setEnabled(false);
          }
        });
      } catch {
        if (active) {
          setEnabled(false);
          setError("Screen auto-lock could not be disabled on this device.");
        }
      }
    };

    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      active = false;
      lock?.release();
      document.removeEventListener("visibilitychange", request);
    };
  }, [enabled]);

  return {
    supported: typeof navigator !== "undefined" && "wakeLock" in navigator,
    enabled,
    toggle: () => {
      setError("");
      setEnabled(!enabled);
    },
    error,
  };
}

export default function GroceryListView({
  session = EMPTY_GROCERY_SESSION,
  recipes = [],
  onUpdateSession,
  onDispatchMutation,
  onCompleteTrip,
  syncStatus = "saved",
  onToast,
}) {
  const [customInput, setCustomInput] = useState("");
  const [staplesOpen, setStaplesOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const awake = useKeepAwake();
  const inputRef = useRef(null);
  const copyBtnRef = useRef(null);

  // Derive active view model using the pure deterministic selector
  const derived = selectGroceryList(session, recipes);
  const isOffline = typeof navigator !== "undefined" && !navigator.onLine;

  const isEmpty = derived.totalCount === 0 && derived.activeRecipes.length === 0;

  // Auto-close complete trip modal if list becomes empty
  useEffect(() => {
    if (isEmpty && completeModalOpen) {
      setCompleteModalOpen(false);
    }
  }, [isEmpty, completeModalOpen]);

  // Focus share modal copy button when opened
  useEffect(() => {
    if (shareModalOpen) {
      const timer = setTimeout(() => {
        copyBtnRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [shareModalOpen]);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (shareModalOpen) setShareModalOpen(false);
        if (completeModalOpen) setCompleteModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shareModalOpen, completeModalOpen]);

  // Centralized action dispatcher supporting mutation sync & session update
  const dispatchAction = (mutation, nextSession) => {
    if (onDispatchMutation) {
      onDispatchMutation(mutation);
    }
    if (onUpdateSession) {
      onUpdateSession(nextSession);
    }
  };

  // --- Handlers ---
  const handleToggleItem = (item) => {
    const nextStatus = item.status === "checked" ? "unchecked" : "checked";
    const now = Date.now();

    if (item.isCustom) {
      const updatedCustom = (session.customItems || []).map((c) =>
        c.id === item.id ? { ...c, status: nextStatus, updatedAt: now } : c
      );
      dispatchAction(
        {
          type: "ITEM_STATUS_CHANGED",
          targetId: item.id,
          payload: { status: nextStatus },
          clientTimestamp: now,
        },
        {
          ...session,
          customItems: updatedCustom,
          updatedAt: now,
        }
      );
    } else {
      const updatedOverrides = {
        ...(session.itemOverrides || {}),
        [item.key]: {
          status: nextStatus,
          updatedAt: now,
        },
      };
      dispatchAction(
        {
          type: "ITEM_STATUS_CHANGED",
          targetId: item.key,
          payload: { status: nextStatus },
          clientTimestamp: now,
        },
        {
          ...session,
          itemOverrides: updatedOverrides,
          updatedAt: now,
        }
      );
    }
  };

  const handleDismissItem = (item) => {
    const now = Date.now();
    if (item.isCustom) {
      const updatedCustom = (session.customItems || []).map((c) =>
        c.id === item.id ? { ...c, status: "dismissed", updatedAt: now } : c
      );
      dispatchAction(
        {
          type: "CUSTOM_ITEM_DELETED",
          targetId: item.id,
          payload: {},
          clientTimestamp: now,
        },
        {
          ...session,
          customItems: updatedCustom,
          updatedAt: now,
        }
      );
    } else {
      const updatedOverrides = {
        ...(session.itemOverrides || {}),
        [item.key]: {
          status: "dismissed",
          updatedAt: now,
        },
      };
      dispatchAction(
        {
          type: "ITEM_DISMISSED",
          targetId: item.key,
          payload: {},
          clientTimestamp: now,
        },
        {
          ...session,
          itemOverrides: updatedOverrides,
          updatedAt: now,
        }
      );
    }
    onToast?.(`Removed ${item.name}`, "info");
  };

  const handlePromoteStaple = (staple) => {
    const now = Date.now();
    const updatedOverrides = {
      ...(session.itemOverrides || {}),
      [staple.key]: {
        ...(session.itemOverrides?.[staple.key] || {}),
        status: "unchecked",
        isPantryPromoted: true,
        updatedAt: now,
      },
    };
    dispatchAction(
      {
        type: "PANTRY_ITEM_PROMOTED",
        targetId: staple.key,
        payload: {},
        clientTimestamp: now,
      },
      {
        ...session,
        itemOverrides: updatedOverrides,
        updatedAt: now,
      }
    );
    onToast?.(`Added ${staple.name} to grocery list`, "success");
  };

  const handleUpdateServings = (recipeId, delta) => {
    const now = Date.now();
    const curRecipe = (session.recipes || []).find((r) => r.recipeId === recipeId);
    const nextServings = Math.max(1, Math.min(100, (curRecipe?.servings || 2) + delta));
    const updatedRecipes = (session.recipes || []).map((r) => {
      if (r.recipeId === recipeId) {
        return { ...r, servings: nextServings };
      }
      return r;
    });
    dispatchAction(
      {
        type: "RECIPE_SERVINGS_CHANGED",
        targetId: recipeId,
        payload: { nextServings },
        clientTimestamp: now,
      },
      {
        ...session,
        recipes: updatedRecipes,
        updatedAt: now,
      }
    );
  };

  const handleRemoveRecipe = (recipeId, title) => {
    const now = Date.now();
    const updatedRecipes = (session.recipes || []).filter((r) => r.recipeId !== recipeId);
    dispatchAction(
      {
        type: "RECIPE_REMOVED",
        targetId: recipeId,
        payload: {},
        clientTimestamp: now,
      },
      {
        ...session,
        recipes: updatedRecipes,
        updatedAt: now,
      }
    );
    onToast?.(`Removed ${title} from groceries`, "info");
  };

  const handleAddCustomItem = (e) => {
    e.preventDefault();
    const trimmed = customInput.trim();
    if (!trimmed) return;

    const now = Date.now();
    const newId = generateUUID();
    const newItem = {
      id: newId,
      name: trimmed,
      quantity: null,
      unit: "",
      category: categorizeAisle(trimmed),
      note: "",
      status: "unchecked",
      updatedAt: now,
    };

    dispatchAction(
      {
        type: "CUSTOM_ITEM_ADDED",
        targetId: newId,
        payload: newItem,
        clientTimestamp: now,
      },
      {
        ...session,
        customItems: [...(session.customItems || []), newItem],
        updatedAt: now,
      }
    );

    setCustomInput("");
    inputRef.current?.focus();
  };

  const handleClearAll = () => {
    if (onCompleteTrip) {
      onCompleteTrip("clear");
    } else if (onUpdateSession) {
      onUpdateSession(resetGrocerySession());
    }
    setCompleteModalOpen(false);
    onToast?.("Grocery list cleared", "info");
  };

  const handleKeepUnchecked = () => {
    if (onCompleteTrip) {
      onCompleteTrip("rollover");
    } else if (onUpdateSession) {
      onUpdateSession(rolloverGrocerySession(session, recipes));
    }
    setCompleteModalOpen(false);
    onToast?.("Completed trip; rolled over remaining items into standalone custom items", "success");
  };

  // --- Export / Share Handlers ---
  const exportText = formatGroceryListText(derived);

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onToast?.("Grocery list copied to clipboard!", "success");
    } catch {
      onToast?.("Failed to copy to clipboard", "error");
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "MISE Grocery List",
          text: exportText,
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          onToast?.("Could not share list", "error");
        }
      }
    }
  };

  return (
    <main className="grocery-page w-full max-w-[1080px] mx-auto px-4 sm:px-6 md:px-9 py-6 pb-24" id="recipe-main">
      {/* Top navigation toolbar */}
      <div className="detail-toolbar flex items-center justify-between mb-7 pb-4 border-b border-line">
        <a className="back-link inline-flex items-center gap-2 text-muted hover:text-ink text-sm font-medium transition-colors" href="#/">
          <ArrowLeft size={17} />
          Back to recipes
        </a>
        <div className="grocery-top-actions flex items-center gap-3.5">
          {/* Realtime Sync Status Badge */}
          <div
            className={cn(
              "grocery-sync-pill select-none rounded-full inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold transition-all",
              syncStatus === "saved" && "grocery-sync-pill--saved text-[#2b6e4e] bg-[#2b6e4e]/10",
              syncStatus === "syncing" && "grocery-sync-pill--syncing text-[#a26514] bg-[#a26514]/10",
              syncStatus === "offline" && "grocery-sync-pill--offline text-[#6e675f] bg-[#6e675f]/10"
            )}
            title={
              syncStatus === "saved"
                ? "All changes saved to cloud"
                : syncStatus === "syncing"
                ? "Syncing changes..."
                : "Working offline - changes will sync when reconnected"
            }
          >
            {syncStatus === "syncing" ? (
              <RefreshCw size={13} className="spin-icon" />
            ) : syncStatus === "offline" ? (
              <CloudOff size={13} />
            ) : (
              <Cloud size={13} />
            )}
            <span>
              {syncStatus === "syncing"
                ? "Syncing..."
                : syncStatus === "offline"
                ? "Offline"
                : "Saved"}
            </span>
          </div>

          {/* Share / Export button */}
          {!isEmpty && (
            <button
              type="button"
              className="icon-button grocery-top-icon-btn inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#e3ded4] bg-white text-ink hover:bg-[#e3ded4]/35 hover:border-[#b4aca0]/70 cursor-pointer transition-all"
              onClick={() => setShareModalOpen(true)}
              aria-label="Share or export grocery list"
              title="Share or export list"
            >
              <Share2 size={16} />
            </button>
          )}

          {awake.supported && (
            <button
              type="button"
              className={cn(
                "awake-toggle grocery-awake-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-colors",
                awake.enabled
                  ? "active border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:text-ink"
              )}
              onClick={awake.toggle}
              aria-pressed={awake.enabled}
              title="Keep screen awake while shopping"
            >
              <Sun size={15} />
              <span>{awake.enabled ? "Screen awake" : "Keep awake"}</span>
            </button>
          )}

          {!isEmpty && (
            <button
              type="button"
              className="text-button grocery-clear-btn inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink cursor-pointer transition-colors"
              onClick={() => setCompleteModalOpen(true)}
            >
              <CheckCheck size={16} />
              <span>Complete trip</span>
            </button>
          )}
        </div>
      </div>

      {awake.error && (
        <p className="inline-notice text-xs text-terracotta mb-4" role="status">
          {awake.error}
        </p>
      )}

      {/* Main Header */}
      <header className="grocery-header my-7">
        <div className="grocery-title-area">
          <div className="eyebrow flex items-center gap-2 mb-2 text-terracotta text-xs font-semibold uppercase tracking-wider">
            Market Bag
          </div>
          <h1 className="font-serif text-ink my-1.5 mb-2 text-[clamp(32px,4vw,44px)] leading-[1.1] font-normal">
            Grocery List
          </h1>
          {!isEmpty && (
            <p className="grocery-subtitle text-muted text-sm m-0">
              {derived.checkedCount} of {derived.totalCount} items purchased ({derived.progressPercent}%)
            </p>
          )}
        </div>

        {!isEmpty && (
          <div
            className="grocery-progress-bar bg-[#e3ded4]/70 rounded-full w-full h-1.5 mt-3.5 overflow-hidden"
            role="progressbar"
            aria-valuenow={derived.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="grocery-progress-fill bg-ink rounded-full h-full transition-all duration-250"
              style={{ width: `${derived.progressPercent}%` }}
            />
          </div>
        )}
      </header>

      {/* Active Recipes Bar */}
      {derived.activeRecipes.length > 0 && (
        <section className="grocery-recipes-section border border-[#e3ded4] bg-[#f6f2e9]/70 rounded-2xl mb-6 p-4 md:px-5" aria-label="Recipes in list">
          <div className="grocery-section-heading flex items-baseline justify-between mb-3">
            <h2 className="text-ink text-[15px] font-semibold m-0">Recipes in list</h2>
            <span className="text-muted text-xs">
              {derived.activeRecipes.length}{" "}
              {derived.activeRecipes.length === 1 ? "recipe" : "recipes"}
            </span>
          </div>
          <div className="grocery-recipes-scroller flex gap-3 pb-1.5 overflow-x-auto [scrollbar-width:thin]">
            {derived.activeRecipes.map((r) => (
              <div className="grocery-recipe-chip flex shrink-0 items-center gap-2.5 min-w-[220px] p-2 md:px-3 rounded-xl border border-[#e3ded4] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]" key={r.recipeId}>
                <div className="grocery-recipe-chip__art shrink-0 w-[38px] h-[38px] rounded-lg overflow-hidden">
                  <RecipeArtwork artwork={r.artwork} title={r.title} />
                </div>
                <div className="grocery-recipe-chip__info flex-1 min-w-0">
                  <a href={`#/recipe/${r.recipeId}`} className="grocery-recipe-chip__title block truncate text-ink text-[13px] font-semibold mb-1 no-underline hover:underline">
                    {r.title}
                  </a>
                  <div className="grocery-servings-stepper inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-[#f4f0e6]/70">
                    <button
                      type="button"
                      className="icon-button grocery-stepper-btn inline-flex items-center justify-center w-5 h-5 p-0 rounded border-0 bg-transparent text-ink disabled:opacity-35 cursor-pointer hover:bg-black/5"
                      onClick={() => handleUpdateServings(r.recipeId, -1)}
                      disabled={r.servings <= 1}
                      aria-label="Decrease servings"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="grocery-servings-label text-ink text-[11px] font-semibold">{r.servings} serv</span>
                    <button
                      type="button"
                      className="icon-button grocery-stepper-btn inline-flex items-center justify-center w-5 h-5 p-0 rounded border-0 bg-transparent text-ink disabled:opacity-35 cursor-pointer hover:bg-black/5"
                      onClick={() => handleUpdateServings(r.recipeId, 1)}
                      disabled={r.servings >= 100}
                      aria-label="Increase servings"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-button grocery-recipe-remove text-muted opacity-60 hover:opacity-100 hover:text-[#c93b2b] p-1 cursor-pointer transition-all"
                  onClick={() => handleRemoveRecipe(r.recipeId, r.title)}
                  aria-label={`Remove ${r.title} from groceries`}
                  title="Remove from groceries"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add Custom Ad-hoc Item Input */}
      <section className="grocery-add-section mb-7" aria-label="Add grocery item">
        <form className="grocery-add-form flex gap-2.5" onSubmit={handleAddCustomItem}>
          <input
            ref={inputRef}
            type="text"
            className="grocery-add-input flex-1 px-4 py-3 rounded-xl border border-[#e3ded4] bg-white text-ink text-[15px] outline-none shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-colors focus:border-ink"
            placeholder="Add an item (e.g. coffee beans, sparkling water, paper towels)..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            aria-label="New grocery item"
          />
          <Button
            type="submit"
            variant="light"
            size="action"
            className="grocery-add-submit rounded-xl gap-1.5 px-5"
            disabled={!customInput.trim()}
          >
            <Plus size={16} />
            <span>Add</span>
          </Button>
        </form>
      </section>

      {/* Empty State */}
      {isEmpty ? (
        <div className="grocery-empty-state text-center max-w-[440px] mx-auto py-16 px-5">
          <div className="grocery-empty-icon flex items-center justify-center w-20 h-20 mx-auto mb-5 rounded-full bg-[#f4f0e6]/80 text-ink">
            <ShoppingBag size={48} strokeWidth={1.2} />
          </div>
          <h2 className="font-serif text-ink text-2xl m-0 mb-2 font-normal">Your grocery list is empty</h2>
          <p className="text-muted text-sm leading-relaxed m-0 mb-6">
            Browse recipes on your shelf and tap <strong>&quot;Add to Groceries&quot;</strong> to
            automatically consolidate ingredients by aisle.
          </p>
          <Button as="a" href="#/" variant="primary" size="default" className="grocery-browse-btn inline-flex">
            Browse recipes
          </Button>
        </div>
      ) : (
        /* Aisle Grouped Checklist */
        <div className="grocery-aisles-list">
          {derived.aisles.map((aisle) => (
            <section className="grocery-aisle-group mb-7" key={aisle.category}>
              <div className="grocery-aisle-header flex items-baseline justify-between mb-3 pb-2 border-b border-[#e3ded4]">
                <h3 className="font-serif text-ink text-xl m-0 font-normal">{aisle.category}</h3>
                <span className="grocery-aisle-count text-muted text-xs font-semibold">
                  {aisle.items.filter((i) => i.status === "checked").length}/{aisle.items.length}
                </span>
              </div>
              <ul className="grocery-items-list flex flex-col gap-2 m-0 p-0 list-none" role="list">
                {aisle.items.map((item) => {
                  const isChecked = item.status === "checked";
                  return (
                    <li
                      key={item.key}
                      className={cn(
                        "grocery-item-row flex items-center gap-3.5 min-h-[50px] max-[800px]:min-h-[52px] px-4 py-2.5 max-[800px]:px-3.5 rounded-xl border transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)] group",
                        isChecked
                          ? "is-checked opacity-55 bg-[#f8f6f0]/60 border-[#e3ded4]/70"
                          : "bg-white border-[#e3ded4]/70 hover:border-[#e3ded4] hover:bg-white"
                      )}
                    >
                      <button
                        type="button"
                        className={cn(
                          "grocery-checkbox shrink-0 flex items-center justify-center w-6 h-6 p-0 rounded-[7px] border-2 cursor-pointer transition-all text-white",
                          isChecked
                            ? "is-active bg-ink border-ink"
                            : "bg-transparent border-[#b7b0a5] hover:border-ink"
                        )}
                        onClick={() => handleToggleItem(item)}
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-label={`Mark ${item.name} as ${isChecked ? "not purchased" : "purchased"}`}
                      >
                        {isChecked && <Check size={14} strokeWidth={2.5} />}
                      </button>

                      <div className="grocery-item-content flex-1 min-w-0 cursor-pointer" onClick={() => handleToggleItem(item)}>
                        <div className="grocery-item-main flex flex-wrap items-baseline gap-2">
                          {item.quantityText && (
                            <span className="grocery-item-qty text-ink text-sm font-bold">{item.quantityText}</span>
                          )}
                          <span className={cn("grocery-item-name text-ink text-[15px] break-words", isChecked && "text-muted line-through")}>
                            {item.name}
                          </span>
                        </div>

                        {/* Requirements & Recipe Attribution */}
                        {item.isCompatibleQuantity ? (
                          item.recipes && item.recipes.length > 0 && (
                            <div className="grocery-item-attribution flex flex-wrap gap-1.5 mt-1">
                              {item.recipes.map((r, idx) => (
                                <span key={`${r.recipeId}-${idx}`} className="grocery-recipe-pill px-2 py-0.5 rounded-md bg-[#efebe1]/80 text-muted text-[11px] leading-[1.3]">
                                  {r.note ? `${r.note} ` : ""}for {r.recipeTitle}
                                </span>
                              ))}
                            </div>
                          )
                        ) : (
                          item.requirements && item.requirements.length > 0 && (
                            <div className="grocery-item-requirements flex flex-col gap-0.5 mt-1">
                              {item.requirements.map((req, idx) => (
                                <div key={idx} className="grocery-requirement-line flex items-baseline gap-1.5 text-muted text-xs">
                                  <span className="grocery-requirement-qty text-ink font-semibold">{req.quantityText}</span>
                                  <span className="grocery-requirement-dash text-muted/60">—</span>
                                  <span className="grocery-requirement-recipe text-muted">{req.recipeTitle}</span>
                                </div>
                              ))}
                            </div>
                          )
                        )}

                        {item.isCustom && item.note && (
                          <span className="grocery-item-note text-muted mt-0.5 text-xs block">{item.note}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="icon-button grocery-item-dismiss text-muted opacity-35 max-[800px]:opacity-60 group-hover:opacity-80 hover:!opacity-100 hover:text-[#c93b2b] p-1 cursor-pointer transition-all"
                        onClick={() => handleDismissItem(item)}
                        aria-label={`Delete ${item.name}`}
                        title="Remove from list"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {/* Pantry Staples Drawer (Check at home before shopping) */}
          {derived.pantryStaples && derived.pantryStaples.length > 0 && (
            <section className="grocery-staples-section mt-8 rounded-[14px] border border-dashed border-[#e3ded4] bg-[#f8f5ee]/70 overflow-hidden">
              <button
                type="button"
                className="grocery-staples-summary flex items-center justify-between w-full p-3.5 md:px-[18px] text-left bg-transparent border-0 cursor-pointer"
                onClick={() => setStaplesOpen(!staplesOpen)}
                aria-expanded={staplesOpen}
              >
                <div className="grocery-staples-summary__title flex items-center gap-2 text-ink text-sm font-semibold">
                  {staplesOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span>Pantry Staples (Check at home before shopping)</span>
                </div>
                <span className="grocery-staples-badge px-2 py-0.5 rounded-full bg-[#e3ded4]/80 text-ink text-[11px] font-bold">
                  {derived.pantryStaples.length}
                </span>
              </button>

              {staplesOpen && (
                <div className="grocery-staples-body pt-0 px-4 md:px-[18px] pb-[18px] border-t border-[#e3ded4]/60">
                  <p className="grocery-staples-help my-3 mb-3.5 text-muted text-[13px] leading-[1.4]">
                    These common ingredients are called for in your active recipes. Tap <strong>[+]</strong> to add any you&apos;re running low on to your store checklist.
                  </p>
                  <ul className="grocery-items-list flex flex-col gap-2 m-0 p-0 list-none" role="list">
                    {derived.pantryStaples.map((staple) => (
                      <li key={staple.key} className="grocery-item-row grocery-item-row--staple flex items-center gap-3.5 min-h-[50px] px-4 py-2.5 rounded-xl border border-[#e3ded4]/70 bg-white/85">
                        <div className="grocery-item-content flex-1 min-w-0">
                          <div className="grocery-item-main flex flex-wrap items-baseline gap-2">
                            {staple.quantityText && (
                              <span className="grocery-item-qty text-ink text-sm font-bold">{staple.quantityText}</span>
                            )}
                            <span className="grocery-item-name text-ink text-[15px] break-words">{staple.name}</span>
                          </div>
                          {staple.recipes && staple.recipes.length > 0 && (
                            <div className="grocery-item-attribution flex flex-wrap gap-1.5 mt-1">
                              {staple.recipes.map((r, idx) => (
                                <span key={`${r.recipeId}-${idx}`} className="grocery-recipe-pill px-2 py-0.5 rounded-md bg-[#efebe1]/80 text-muted text-[11px] leading-[1.3]">
                                  for {r.recipeTitle}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="light"
                          size="sm"
                          className="grocery-staple-add-btn rounded-lg gap-1.5 px-2.5 py-1 text-xs"
                          onClick={() => handlePromoteStaple(staple)}
                        >
                          <Plus size={14} />
                          <span>Add to list</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Share / Export Modal */}
      {shareModalOpen && (
        <div className="modal-backdrop fixed inset-0 z-[1050] flex items-center justify-center p-5 bg-[#121e18]/60 backdrop-blur-sm animate-backdrop-fade" onClick={() => setShareModalOpen(false)}>
          <div
            className="modal-panel grocery-share-modal w-full max-w-[480px] bg-white border border-[#e3ded4] rounded-[20px] max-h-[90vh] p-6 md:p-[30px] relative overflow-y-auto shadow-[0_32px_80px_rgba(18,32,24,0.28)] animate-panel-scale"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between mb-3.5">
              <h2 id="share-modal-title" className="font-serif text-ink text-2xl font-semibold m-0 tracking-[-0.01em]">Share Grocery List</h2>
              <IconButton
                variant="default"
                size="sm"
                className="rounded-full"
                onClick={() => setShareModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </IconButton>
            </div>
            <p className="grocery-modal-desc text-muted text-sm leading-relaxed m-0 mb-4">
              Copy this formatted shopping checklist to send via text message, notes, or email.
            </p>
            <textarea
              className="grocery-share-preview w-full p-3 md:p-3.5 my-3.5 mb-5 rounded-xl border border-[#e3ded4] bg-[#f8f5ee]/70 text-ink font-mono text-[12.5px] leading-relaxed resize-y box-border"
              readOnly
              value={exportText}
              rows={12}
              aria-label="Plain-text grocery list preview"
            />
            <div className="grocery-share-modal__actions flex flex-col gap-2.5">
              <Button
                ref={copyBtnRef}
                type="button"
                variant="primary"
                size="default"
                className="w-full justify-center gap-2"
                onClick={handleCopyText}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? "Copied to Clipboard!" : "Copy to Clipboard"}</span>
              </Button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <Button
                  type="button"
                  variant="light"
                  size="default"
                  className="w-full justify-center gap-2"
                  onClick={handleNativeShare}
                >
                  <Share2 size={16} />
                  <span>Share via Apps...</span>
                </Button>
              )}
              <button
                type="button"
                className="text-button text-muted hover:text-ink text-sm py-2 cursor-pointer transition-colors"
                onClick={() => setShareModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Completion Confirmation Modal */}
      {completeModalOpen && (
        <div
          className="modal-backdrop fixed inset-0 z-[1050] flex items-center justify-center p-5 bg-[#121e18]/60 backdrop-blur-sm animate-backdrop-fade"
          onClick={() => setCompleteModalOpen(false)}
          role="presentation"
        >
          <div
            className="modal-panel grocery-complete-modal w-full max-w-[480px] bg-white border border-[#e3ded4] rounded-[20px] max-h-[90vh] p-6 md:p-[30px] relative overflow-y-auto shadow-[0_32px_80px_rgba(18,32,24,0.28)] animate-panel-scale"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header flex items-center justify-between mb-3.5">
              <h2 id="complete-modal-title" className="font-serif text-ink text-2xl font-semibold m-0 tracking-[-0.01em]">Complete Grocery Trip?</h2>
              <IconButton
                variant="default"
                size="sm"
                className="rounded-full"
                onClick={() => setCompleteModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </IconButton>
            </div>

            <p className="grocery-modal-desc text-muted text-sm leading-relaxed m-0 mb-4">
              Choose how you&apos;d like to finalize this shopping trip.
            </p>

            <div className="grocery-complete-stat-card flex items-center justify-between my-4 mb-[22px] p-4 md:px-[18px] rounded-[14px] border border-[#e3ded4] bg-gradient-to-br from-[#f8f5ee]/90 to-[#f3eee4]/70">
              <div className="grocery-complete-stat-info flex flex-col gap-1">
                <span className="grocery-complete-stat-label text-muted text-xs font-bold uppercase tracking-[0.04em]">Purchased Items</span>
                <span className="grocery-complete-stat-val text-ink text-lg font-bold">
                  {derived.checkedCount} of {derived.totalCount} items
                </span>
              </div>
              <span className="grocery-complete-stat-badge px-3 py-1 rounded-full bg-ink text-white text-[13px] font-bold">
                {derived.progressPercent}% Done
              </span>
            </div>

            {isOffline && (
              <div className="grocery-offline-notice flex items-start gap-2.5 p-3 md:px-4 mb-4 rounded-xl bg-[#c16e17]/10 border border-[#c16e17]/30 text-[#92540d] text-[13px] leading-[1.45]" role="alert">
                <CloudOff size={16} className="shrink-0 mt-0.5" />
                <span>
                  <strong>Offline Mode:</strong> Internet connection is required to finalize this trip and roll over items so other devices stay in sync.
                </span>
              </div>
            )}

            <div className="grocery-complete-choices flex flex-col gap-3">
              <button
                type="button"
                className="grocery-complete-choice-btn is-primary group flex flex-col items-start gap-1 w-full p-4 md:px-[18px] rounded-2xl border text-left cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed bg-ink border-ink text-white hover:not-disabled:bg-[#383630] hover:not-disabled:border-[#383630] hover:not-disabled:shadow-[0_8px_20px_rgba(36,35,31,0.22)]"
                onClick={handleKeepUnchecked}
                disabled={isOffline}
                aria-label="Keep unpurchased items (Rollover)"
                title={isOffline ? "Requires internet connection" : "Keep remaining items"}
              >
                <div className="grocery-complete-choice-title flex items-center gap-2 text-[15px] font-semibold">
                  <Sparkles size={16} />
                  <strong>Keep unpurchased items (Rollover)</strong>
                </div>
                <span className="grocery-complete-choice-desc text-[12.5px] leading-relaxed opacity-85">
                  Roll over unpurchased items into a fresh trip and clear purchased items.
                </span>
              </button>

              <button
                type="button"
                className="grocery-complete-choice-btn group flex flex-col items-start gap-1 w-full p-4 md:px-[18px] rounded-2xl border text-left cursor-pointer transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed bg-white border-[#e3ded4] text-ink hover:not-disabled:border-ink hover:not-disabled:-translate-y-px hover:not-disabled:shadow-[0_6px_16px_rgba(36,35,31,0.08)]"
                onClick={handleClearAll}
                disabled={isOffline}
                aria-label="Clear entire list"
                title={isOffline ? "Requires internet connection" : "Clear entire list"}
              >
                <div className="grocery-complete-choice-title flex items-center gap-2 text-[15px] font-semibold">
                  <Trash2 size={16} />
                  <strong>Clear entire list</strong>
                </div>
                <span className="grocery-complete-choice-desc text-[12.5px] leading-relaxed opacity-85">
                  Finish this trip and start fresh with an empty cart.
                </span>
              </button>
            </div>

            <div className="grocery-complete-modal__footer flex justify-end mt-4 pt-3.5 border-t border-[#e3ded4]">
              <button
                type="button"
                className="text-button text-muted hover:text-ink text-sm py-1 cursor-pointer transition-colors"
                onClick={() => setCompleteModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
