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
  userId = null,
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
    <main className="grocery-page" id="recipe-main">
      {/* Top navigation toolbar */}
      <div className="detail-toolbar">
        <a className="back-link" href="#/">
          <ArrowLeft size={17} />
          Back to recipes
        </a>
        <div className="grocery-top-actions">
          {/* Realtime Sync Status Badge */}
          <div
            className={`grocery-sync-pill grocery-sync-pill--${syncStatus}`}
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
              className="icon-button grocery-top-icon-btn"
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
              className={`awake-toggle grocery-awake-btn ${awake.enabled ? "active" : ""}`}
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
              className="text-button grocery-clear-btn"
              onClick={() => setCompleteModalOpen(true)}
            >
              <CheckCheck size={16} />
              <span>Complete trip</span>
            </button>
          )}
        </div>
      </div>

      {awake.error && (
        <p className="inline-notice" role="status">
          {awake.error}
        </p>
      )}

      {/* Main Header */}
      <header className="grocery-header">
        <div className="grocery-title-area">
          <div className="eyebrow">Market Bag</div>
          <h1>Grocery List</h1>
          {!isEmpty && (
            <p className="grocery-subtitle">
              {derived.checkedCount} of {derived.totalCount} items purchased ({derived.progressPercent}%)
            </p>
          )}
        </div>

        {!isEmpty && (
          <div
            className="grocery-progress-bar"
            role="progressbar"
            aria-valuenow={derived.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="grocery-progress-fill"
              style={{ width: `${derived.progressPercent}%` }}
            />
          </div>
        )}
      </header>

      {/* Active Recipes Bar */}
      {derived.activeRecipes.length > 0 && (
        <section className="grocery-recipes-section" aria-label="Recipes in list">
          <div className="grocery-section-heading">
            <h2>Recipes in list</h2>
            <span>
              {derived.activeRecipes.length}{" "}
              {derived.activeRecipes.length === 1 ? "recipe" : "recipes"}
            </span>
          </div>
          <div className="grocery-recipes-scroller">
            {derived.activeRecipes.map((r) => (
              <div className="grocery-recipe-chip" key={r.recipeId}>
                <div className="grocery-recipe-chip__art">
                  <RecipeArtwork artwork={r.artwork} title={r.title} />
                </div>
                <div className="grocery-recipe-chip__info">
                  <a href={`#/recipe/${r.recipeId}`} className="grocery-recipe-chip__title">
                    {r.title}
                  </a>
                  <div className="grocery-servings-stepper">
                    <button
                      type="button"
                      className="icon-button grocery-stepper-btn"
                      onClick={() => handleUpdateServings(r.recipeId, -1)}
                      disabled={r.servings <= 1}
                      aria-label="Decrease servings"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="grocery-servings-label">{r.servings} serv</span>
                    <button
                      type="button"
                      className="icon-button grocery-stepper-btn"
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
                  className="icon-button grocery-recipe-remove"
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
      <section className="grocery-add-section" aria-label="Add grocery item">
        <form className="grocery-add-form" onSubmit={handleAddCustomItem}>
          <input
            ref={inputRef}
            type="text"
            className="grocery-add-input"
            placeholder="Add an item (e.g. coffee beans, sparkling water, paper towels)..."
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            aria-label="New grocery item"
          />
          <button
            type="submit"
            className="button button--light grocery-add-submit"
            disabled={!customInput.trim()}
          >
            <Plus size={16} />
            <span>Add</span>
          </button>
        </form>
      </section>

      {/* Empty State */}
      {isEmpty ? (
        <div className="grocery-empty-state">
          <div className="grocery-empty-icon">
            <ShoppingBag size={48} strokeWidth={1.2} />
          </div>
          <h2>Your grocery list is empty</h2>
          <p>
            Browse recipes on your shelf and tap <strong>"Add to Groceries"</strong> to
            automatically consolidate ingredients by aisle.
          </p>
          <a href="#/" className="button grocery-browse-btn">
            Browse recipes
          </a>
        </div>
      ) : (
        /* Aisle Grouped Checklist */
        <div className="grocery-aisles-list">
          {derived.aisles.map((aisle) => (
            <section className="grocery-aisle-group" key={aisle.category}>
              <div className="grocery-aisle-header">
                <h3>{aisle.category}</h3>
                <span className="grocery-aisle-count">
                  {aisle.items.filter((i) => i.status === "checked").length}/{aisle.items.length}
                </span>
              </div>
              <ul className="grocery-items-list" role="list">
                {aisle.items.map((item) => {
                  const isChecked = item.status === "checked";
                  return (
                    <li
                      key={item.key}
                      className={`grocery-item-row ${isChecked ? "is-checked" : ""}`}
                    >
                      <button
                        type="button"
                        className={`grocery-checkbox ${isChecked ? "is-active" : ""}`}
                        onClick={() => handleToggleItem(item)}
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-label={`Mark ${item.name} as ${isChecked ? "not purchased" : "purchased"}`}
                      >
                        {isChecked && <Check size={14} strokeWidth={2.5} />}
                      </button>

                      <div className="grocery-item-content" onClick={() => handleToggleItem(item)}>
                        <div className="grocery-item-main">
                          {item.quantityText && (
                            <span className="grocery-item-qty">{item.quantityText}</span>
                          )}
                          <span className="grocery-item-name">{item.name}</span>
                        </div>

                        {/* Requirements & Recipe Attribution */}
                        {item.isCompatibleQuantity ? (
                          item.recipes && item.recipes.length > 0 && (
                            <div className="grocery-item-attribution">
                              {item.recipes.map((r, idx) => (
                                <span key={`${r.recipeId}-${idx}`} className="grocery-recipe-pill">
                                  {r.note ? `${r.note} ` : ""}for {r.recipeTitle}
                                </span>
                              ))}
                            </div>
                          )
                        ) : (
                          item.requirements && item.requirements.length > 0 && (
                            <div className="grocery-item-requirements">
                              {item.requirements.map((req, idx) => (
                                <div key={idx} className="grocery-requirement-line">
                                  <span className="grocery-requirement-qty">{req.quantityText}</span>
                                  <span className="grocery-requirement-dash">—</span>
                                  <span className="grocery-requirement-recipe">{req.recipeTitle}</span>
                                </div>
                              ))}
                            </div>
                          )
                        )}

                        {item.isCustom && item.note && (
                          <span className="grocery-item-note">{item.note}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="icon-button grocery-item-dismiss"
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
            <section className="grocery-staples-section">
              <button
                type="button"
                className="grocery-staples-summary"
                onClick={() => setStaplesOpen(!staplesOpen)}
                aria-expanded={staplesOpen}
              >
                <div className="grocery-staples-summary__title">
                  {staplesOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span>Pantry Staples (Check at home before shopping)</span>
                </div>
                <span className="grocery-staples-badge">{derived.pantryStaples.length}</span>
              </button>

              {staplesOpen && (
                <div className="grocery-staples-body">
                  <p className="grocery-staples-help">
                    These common ingredients are called for in your active recipes. Tap <strong>[+]</strong> to add any you're running low on to your store checklist.
                  </p>
                  <ul className="grocery-items-list" role="list">
                    {derived.pantryStaples.map((staple) => (
                      <li key={staple.key} className="grocery-item-row grocery-item-row--staple">
                        <div className="grocery-item-content">
                          <div className="grocery-item-main">
                            {staple.quantityText && (
                              <span className="grocery-item-qty">{staple.quantityText}</span>
                            )}
                            <span className="grocery-item-name">{staple.name}</span>
                          </div>
                          {staple.recipes && staple.recipes.length > 0 && (
                            <div className="grocery-item-attribution">
                              {staple.recipes.map((r, idx) => (
                                <span key={`${r.recipeId}-${idx}`} className="grocery-recipe-pill">
                                  for {r.recipeTitle}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="button button--light grocery-staple-add-btn"
                          onClick={() => handlePromoteStaple(staple)}
                        >
                          <Plus size={14} />
                          <span>Add to list</span>
                        </button>
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
        <div className="modal-backdrop" onClick={() => setShareModalOpen(false)}>
          <div
            className="modal-panel grocery-share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="share-modal-title">Share Grocery List</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShareModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <p className="grocery-modal-desc">
              Copy this formatted shopping checklist to send via text message, notes, or email.
            </p>
            <textarea
              className="grocery-share-preview"
              readOnly
              value={exportText}
              rows={12}
              aria-label="Plain-text grocery list preview"
            />
            <div className="grocery-share-modal__actions">
              <button
                ref={copyBtnRef}
                type="button"
                className="button button--accent"
                onClick={handleCopyText}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? "Copied to Clipboard!" : "Copy to Clipboard"}</span>
              </button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <button
                  type="button"
                  className="button button--light"
                  onClick={handleNativeShare}
                >
                  <Share2 size={16} />
                  <span>Share via Apps...</span>
                </button>
              )}
              <button
                type="button"
                className="text-button"
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
          className="modal-backdrop"
          onClick={() => setCompleteModalOpen(false)}
          role="presentation"
        >
          <div
            className="modal-panel grocery-complete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="complete-modal-title">Complete Grocery Trip?</h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCompleteModalOpen(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <p className="grocery-modal-desc">
              Choose how you'd like to finalize this shopping trip.
            </p>

            <div className="grocery-complete-stat-card">
              <div className="grocery-complete-stat-info">
                <span className="grocery-complete-stat-label">Purchased Items</span>
                <span className="grocery-complete-stat-val">
                  {derived.checkedCount} of {derived.totalCount} items
                </span>
              </div>
              <span className="grocery-complete-stat-badge">
                {derived.progressPercent}% Done
              </span>
            </div>

            {isOffline && (
              <div className="grocery-offline-notice" role="alert">
                <CloudOff size={16} />
                <span>
                  <strong>Offline Mode:</strong> Internet connection is required to finalize this trip and roll over items so other devices stay in sync.
                </span>
              </div>
            )}

            <div className="grocery-complete-choices">
              <button
                type="button"
                className="grocery-complete-choice-btn is-primary"
                onClick={handleKeepUnchecked}
                disabled={isOffline}
                aria-label="Keep unpurchased items (Rollover)"
                title={isOffline ? "Requires internet connection" : "Keep remaining items"}
              >
                <div className="grocery-complete-choice-title">
                  <Sparkles size={16} />
                  <strong>Keep unpurchased items (Rollover)</strong>
                </div>
                <span className="grocery-complete-choice-desc">
                  Roll over unpurchased items into a fresh trip and clear purchased items.
                </span>
              </button>

              <button
                type="button"
                className="grocery-complete-choice-btn"
                onClick={handleClearAll}
                disabled={isOffline}
                aria-label="Clear entire list"
                title={isOffline ? "Requires internet connection" : "Clear entire list"}
              >
                <div className="grocery-complete-choice-title">
                  <Trash2 size={16} />
                  <strong>Clear entire list</strong>
                </div>
                <span className="grocery-complete-choice-desc">
                  Finish this trip and start fresh with an empty cart.
                </span>
              </button>
            </div>

            <div className="grocery-complete-modal__footer">
              <button
                type="button"
                className="text-button"
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
