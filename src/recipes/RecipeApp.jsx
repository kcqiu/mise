import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  X,
} from "lucide-react";
import publishedRecipes from "./data/recipes.json";
import {
  getCategories,
  EMPTY_LIBRARY,
  readLibrary,
  readAccountLibrary,
  saveAccountLibrary,
  STORAGE_KEY,
} from "./library";
import {
  cloudEnabled,
  deleteAccountRecipe,
  extractAuthErrorFromUrl,
  getSession,
  importAccountLibrary,
  loadAccountLibrary,
  loadRecipeById,
  loadRecipeByShareToken,
  saveAccountRecipe,
  setAccountFavorite,
  setAccountProgress,
  signInWithGoogle,
  signOut,
  watchSession,
  loadAccountGrocerySession,
  saveAccountGroceryMutations,
  completeAccountGrocerySession,
  subscribeGrocerySession,
  broadcastGroceryMutations,
} from "./cloud";
import {
  readGrocerySession,
  saveGrocerySession,
  readGroceryQueue,
  enqueueGroceryMutation,
  ackGroceryMutations,
  clearGroceryQueue,
  applyMutationToSession,
  rebaseMutationsOverSession,
  mergeGuestIntoAccountSession,
  generateUUID,
  getDeviceId,
  EMPTY_GROCERY_SESSION,
} from "./groceries";
import RecipeLibrary from "./components/RecipeLibrary";
import RecipeDetail from "./components/RecipeDetail";
import RecipeEditor from "./components/RecipeEditor";
import AddRecipeModal from "./components/AddRecipeModal";
import AuthModal from "./components/AuthModal";
import ToastStack from "./components/ToastStack";
import GroceryListView from "./components/GroceryListView";
import { AppFooter, AppHeader } from "./components/AppShell";
import useHashRoute from "./useHashRoute";
import { resolveGroceryCompletion } from "./groceryCompletion";
import useToasts from "./useToasts";

const GROCERY_AUTH_PROMPT_SEEN_KEY =
  "mise-groceries-auth-prompt-seen-v1";
const GROCERY_AUTH_PROMPT_DELAY_MS = 10000;

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
  const { toasts, addToast, dismissToast } = useToasts(initial.error);
  const [authModal, setAuthModal] = useState({
    open: typeof window !== "undefined" && window.location.hash === "#/login",
    intent: "signin",
    error: "",
  });
  const route = useHashRoute();
  const [shelfState, setShelfState] = useState({
    query: "",
    category: "",
    collection: "all",
    sort: "collection",
  });
  const [groceryPromptSeen, setGroceryPromptSeen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(GROCERY_AUTH_PROMPT_SEEN_KEY) === "true",
  );
  const [editor, setEditor] = useState(null);
  const [addRecipeModalOpen, setAddRecipeModalOpen] = useState(false);
  const [grocerySession, setGrocerySession] = useState(readGrocerySession);
  const grocerySessionRef = useRef(grocerySession);
  grocerySessionRef.current = grocerySession;
  const [syncStatus, setSyncStatus] = useState("saved");
  const [guestMergeModal, setGuestMergeModal] = useState({
    open: false,
    guestSession: null,
    cloudSession: null,
  });
  const syncTimerRef = useRef(null);
  const syncingRef = useRef(false);
  const accountMenu = useRef(null);
  const activeLibrary = account.session ? account.library : library;
  const personalRecipes = account.session
    ? account.library.recipes
    : library.recipes;
  const personalRecipeIds = useMemo(
    () => new Set(personalRecipes.map((r) => r.id)),
    [personalRecipes],
  );
  const [remoteRecipes, setRemoteRecipes] = useState({});
  const [loadingRemoteId, setLoadingRemoteId] = useState(null);
  const [notFoundRemoteIds, setNotFoundRemoteIds] = useState(() => new Set());

  const sharedRecipes = useMemo(
    () => (account.session ? account.library.sharedRecipes || [] : []),
    [account.session, account.library?.sharedRecipes],
  );

  const allSharedRecipes = useMemo(() => {
    const map = new Map();
    for (const r of sharedRecipes) {
      if (r && r.id) map.set(r.id, r);
    }
    for (const [, r] of Object.entries(remoteRecipes)) {
      if (
        r &&
        r.id &&
        activeLibrary.favorites.includes(r.id) &&
        !personalRecipeIds.has(r.id)
      ) {
        map.set(r.id, r);
      }
    }
    return Array.from(map.values());
  }, [sharedRecipes, remoteRecipes, activeLibrary.favorites, personalRecipeIds]);

  const recipes = useMemo(() => {
    const personalIds = personalRecipeIds;
    const sharedIds = new Set(allSharedRecipes.map((r) => r.id));
    const remainingPublished = publishedRecipes.filter(
      (r) => !personalIds.has(r.id) && !sharedIds.has(r.id),
    );

    const sortedPersonal = [...personalRecipes].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      return 0;
    });

    return [...sortedPersonal, ...allSharedRecipes, ...remainingPublished];
  }, [personalRecipes, allSharedRecipes, personalRecipeIds]);

  const isSharedRoute =
    typeof route === "string" && route.startsWith("shared:");
  const shareToken = isSharedRoute ? route.slice(7) : null;
  const isRecipeRoute = Boolean(
    route && route !== "groceries" && route !== "not-found",
  );
  const knownRecipe = isSharedRoute
    ? remoteRecipes[route]
    : recipes.find((recipe) => recipe.id === route) || remoteRecipes[route];

  useEffect(() => {
    if (!isRecipeRoute || knownRecipe || notFoundRemoteIds.has(route)) {
      return;
    }

    let active = true;
    setLoadingRemoteId(route);

    const fetcher = isSharedRoute
      ? loadRecipeByShareToken(shareToken)
      : loadRecipeById(route);

    if (!fetcher || typeof fetcher.then !== "function") {
      return;
    }

    fetcher
      .then((loaded) => {
        if (!active) return;
        setLoadingRemoteId((current) => (current === route ? null : current));
        if (loaded) {
          const recipeToStore = isSharedRoute
            ? { ...loaded, shareToken }
            : loaded;
          setRemoteRecipes((prev) => ({ ...prev, [route]: recipeToStore }));
        } else {
          setNotFoundRemoteIds((prev) => new Set(prev).add(route));
        }
      })
      .catch(() => {
        if (!active) return;
        setLoadingRemoteId((current) => (current === route ? null : current));
        setNotFoundRemoteIds((prev) => new Set(prev).add(route));
      });

    return () => {
      active = false;
    };
  }, [
    isRecipeRoute,
    isSharedRoute,
    shareToken,
    knownRecipe,
    route,
    notFoundRemoteIds,
  ]);

  const current = knownRecipe || null;

  const allRecipes = useMemo(() => {
    const remoteList = Object.values(remoteRecipes);
    if (!remoteList.length) return recipes;
    const existing = new Set(recipes.map((r) => r.id));
    const extra = remoteList.filter((r) => !existing.has(r.id));
    return [...recipes, ...extra];
  }, [recipes, remoteRecipes]);

  const updateGrocerySession = (nextSession) => {
    const userId = account.session?.user?.id || null;
    setGrocerySession(nextSession);
    saveGrocerySession(nextSession, userId);
  };

  const flushGroceryQueue = useCallback(async (userId) => {
    if (!userId || syncingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncStatus("offline");
      return;
    }
    const queue = readGroceryQueue(userId);
    if (!queue.length) {
      setSyncStatus("saved");
      return;
    }

    syncingRef.current = true;
    setSyncStatus("syncing");

    try {
      const currentSession = grocerySessionRef.current;
      const res = await saveAccountGroceryMutations(
        userId,
        currentSession.id,
        currentSession.revision,
        queue,
      );

      if (res.success) {
        ackGroceryMutations(res.ackMutationIds, userId);
        const remaining = readGroceryQueue(userId);
        const nextSession = res.session
          ? rebaseMutationsOverSession(res.session, remaining)
          : currentSession;

        setGrocerySession(nextSession);
        saveGrocerySession(nextSession, userId);
        setSyncStatus("saved");

        broadcastGroceryMutations(currentSession.id, {
          ackMutationIds: res.ackMutationIds,
          revision: res.revision,
          session: res.session,
        });
      } else if (res.code === "SESSION_COMPLETED") {
        // Requirement 9: Stale-session mutation rejection & user-item recovery
        const recovered = queue.filter(
          (m) => m.type === "CUSTOM_ITEM_ADDED" || m.type === "RECIPE_ADDED",
        );
        clearGroceryQueue(userId);

        const activeSession = res.currentActiveSession || EMPTY_GROCERY_SESSION;
        let nextSession = activeSession;
        if (recovered.length > 0) {
          recovered.forEach((mut) => {
            const remapped = {
              ...mut,
              mutationId: generateUUID(),
              sessionId: nextSession.id,
              observedRevision: nextSession.revision,
            };
            nextSession = applyMutationToSession(nextSession, remapped);
            enqueueGroceryMutation(remapped, userId);
          });
        }
        setGrocerySession(nextSession);
        saveGrocerySession(nextSession, userId);
        setSyncStatus("saved");
        addToast(
          "Your previous grocery trip was completed on another device. Unsaved additions were moved to your active list.",
          "info",
        );
        if (recovered.length > 0) {
          setTimeout(() => flushGroceryQueue(userId), 100);
        }
      } else if (res.code === "REVISION_CONFLICT") {
        const latestSession = res.currentSession || res.session;
        if (latestSession) {
          const remaining = readGroceryQueue(userId);
          const rebased = rebaseMutationsOverSession(latestSession, remaining);
          grocerySessionRef.current = rebased;
          setGrocerySession(rebased);
          saveGrocerySession(rebased, userId);
          setSyncStatus("saved");
          if (remaining.length > 0) {
            setTimeout(() => flushGroceryQueue(userId), 50);
          }
        }
      } else {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setSyncStatus("offline");
        } else {
          setSyncStatus("saved");
        }
      }
    } catch {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSyncStatus("offline");
      } else {
        setSyncStatus("saved");
      }
    } finally {
      syncingRef.current = false;
    }
  }, [addToast]);

  const dispatchGroceryMutation = (mutation) => {
    const userId = account.session?.user?.id || null;
    const currentSession = grocerySessionRef.current;
    const envelope = {
      mutationId: generateUUID(),
      sessionId: currentSession.id,
      deviceId: getDeviceId(),
      type: mutation.type,
      targetId: mutation.targetId,
      payload: mutation.payload || {},
      observedRevision: currentSession.revision || 1,
      clientTimestamp: Date.now(),
    };

    const nextSession = applyMutationToSession(currentSession, envelope);
    setGrocerySession(nextSession);
    saveGrocerySession(nextSession, userId);

    if (userId) {
      enqueueGroceryMutation(envelope, userId);
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => {
        flushGroceryQueue(userId);
      }, 400);
    }
  };

  const handleCompleteTrip = async (action) => {
    const userId = account.session?.user?.id || null;
    const newSessionId = generateUUID();
    const isOnline = typeof navigator === "undefined" || navigator.onLine;

    if (userId && isOnline) setSyncStatus("syncing");

    const result = await resolveGroceryCompletion({
      action,
      userId,
      isOnline,
      session: grocerySession,
      recipes,
      newSessionId,
      completeRemote: completeAccountGrocerySession,
    });

    if (!result.ok) {
      setSyncStatus(isOnline ? "saved" : "offline");
      if (result.latestSession) {
        setGrocerySession(result.latestSession);
        saveGrocerySession(result.latestSession, userId);
      }
      addToast(result.error, "error");
      return result;
    }

    if (result.clearQueue) clearGroceryQueue(userId);
    setGrocerySession(result.nextSession);
    saveGrocerySession(result.nextSession, userId);
    setSyncStatus("saved");

    if (result.broadcast) {
      broadcastGroceryMutations(grocerySession.id, {
        completedSessionId: grocerySession.id,
        activeSession: result.nextSession,
      });
    }

    addToast(result.message, "success");
    return result;
  };

  const toggleRecipeInGroceries = (recipeId, servings) => {
    const targetRecipe = recipes.find((r) => r.id === recipeId);
    const title = targetRecipe ? targetRecipe.title : "Recipe";
    const inBag = (grocerySession.recipes || []).some(
      (r) => r.recipeId === recipeId,
    );

    if (inBag) {
      dispatchGroceryMutation({
        type: "RECIPE_REMOVED",
        targetId: recipeId,
        payload: {},
      });
      addToast(`Removed ${title} from Groceries`, "info");
    } else {
      const serv = servings || targetRecipe?.servings || 2;
      dispatchGroceryMutation({
        type: "RECIPE_ADDED",
        targetId: recipeId,
        payload: { servings: serv },
      });
      addToast(
        `Added ${title} to Groceries (${serv} servings)`,
        "success",
      );
    }
  };

  useEffect(() => {
    const authErr = extractAuthErrorFromUrl();
    if (authErr) {
      setAuthModal({ open: true, intent: "signin", error: authErr });
      addToast(authErr, "error", "Sign-in Notice");
    }
  }, [addToast]);

  useEffect(() => {
    if (window.location.hash === "#/login") {
      setAuthModal((prev) => ({ ...prev, open: true, intent: "signin" }));
    }
  }, [route]);

  // Bug 1: Close account dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        accountMenu.current?.hasAttribute("open") &&
        !accountMenu.current.contains(e.target)
      ) {
        accountMenu.current.removeAttribute("open");
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && accountMenu.current?.hasAttribute("open")) {
        accountMenu.current.removeAttribute("open");
      }
    };
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (
      route !== "groceries" ||
      window.location.hash !== "#/groceries"
    ) {
      return undefined;
    }

    if (
      account.session ||
      account.loading ||
      authModal.open
    ) {
      return undefined;
    }

    const openGroceryAuthPrompt = () => {
      window.localStorage.setItem(GROCERY_AUTH_PROMPT_SEEN_KEY, "true");
      setGroceryPromptSeen(true);
      setAuthModal({
        open: true,
        intent: "groceries",
        error: "",
      });
    };

    if (groceryPromptSeen) {
      openGroceryAuthPrompt();
      return undefined;
    }

    const timer = setTimeout(
      openGroceryAuthPrompt,
      GROCERY_AUTH_PROMPT_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [
    route,
    account.session,
    account.loading,
    authModal.open,
    groceryPromptSeen,
  ]);

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
  }, [addToast]);

  useEffect(() => {
    if (!cloudEnabled) return undefined;
    let active = true;
    const hydrate = async (session) => {
      if (!active) return;
      if (!session) {
        setAccount({ session: null, library: EMPTY_LIBRARY, loading: false });
        setGrocerySession(readGrocerySession(null));
        return;
      }
      setAuthModal((prev) => ({ ...prev, open: false, error: "" }));
      const cachedAccountLib = readAccountLibrary(session.user.id);
      const hasCachedAccount =
        cachedAccountLib.recipes.length > 0 ||
        cachedAccountLib.favorites.length > 0 ||
        Object.keys(cachedAccountLib.progress || {}).length > 0;
      setAccount((current) => ({
        ...current,
        session,
        library: hasCachedAccount ? cachedAccountLib : current.library,
        loading: true,
      }));
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
        if (active) {
          setAccount({ session, library: remote, loading: false });
          saveAccountLibrary(session.user.id, remote);
        }

        // Phase 2: Groceries Auth Hydration & Guest Migration
        try {
          const remoteGroceries = await loadAccountGrocerySession(session.user.id);
          const cloudSession = remoteGroceries?.session || null;
          const guestSession = readGrocerySession(null);
          const cachedUser = readGrocerySession(session.user.id);

          const guestHasData = Boolean(
            (guestSession.recipes && guestSession.recipes.length > 0) ||
            (guestSession.customItems && guestSession.customItems.length > 0) ||
            (guestSession.itemOverrides && Object.keys(guestSession.itemOverrides).length > 0)
          );
          const cloudHasData = Boolean(
            cloudSession && (
              (cloudSession.recipes && cloudSession.recipes.length > 0) ||
              (cloudSession.customItems && cloudSession.customItems.length > 0) ||
              (cloudSession.itemOverrides && Object.keys(cloudSession.itemOverrides).length > 0)
            )
          );

          if (guestHasData && cloudHasData) {
            // Case 4: Both have active data - present prompt modal
            setGuestMergeModal({
              open: true,
              guestSession,
              cloudSession,
            });
          } else if (guestHasData && !cloudHasData) {
            // Case 1: Guest has data, cloud is empty -> push guest to account
            const baseSession = cloudSession || { ...EMPTY_GROCERY_SESSION, id: generateUUID() };
            const merged = mergeGuestIntoAccountSession(guestSession, baseSession);
            setGrocerySession(merged);
            saveGrocerySession(merged, session.user.id);
            saveGrocerySession(EMPTY_GROCERY_SESSION, null);

            // Queue mutations to sync to cloud
            (guestSession.recipes || []).forEach((r) => {
              enqueueGroceryMutation({
                mutationId: generateUUID(),
                sessionId: merged.id,
                deviceId: getDeviceId(),
                type: "RECIPE_ADDED",
                targetId: r.recipeId,
                payload: { servings: r.servings },
                observedRevision: merged.revision,
                clientTimestamp: Date.now(),
              }, session.user.id);
            });
            (guestSession.customItems || []).forEach((c) => {
              enqueueGroceryMutation({
                mutationId: generateUUID(),
                sessionId: merged.id,
                deviceId: getDeviceId(),
                type: "CUSTOM_ITEM_ADDED",
                targetId: c.id,
                payload: c,
                observedRevision: merged.revision,
                clientTimestamp: Date.now(),
              }, session.user.id);
            });
            Object.entries(guestSession.itemOverrides || {}).forEach(([key, ov]) => {
              enqueueGroceryMutation({
                mutationId: generateUUID(),
                sessionId: merged.id,
                deviceId: getDeviceId(),
                type: "ITEM_STATUS_CHANGED",
                targetId: key,
                payload: { status: ov.status },
                observedRevision: merged.revision,
                clientTimestamp: Date.now(),
              }, session.user.id);
            });
            flushGroceryQueue(session.user.id);
          } else {
            // Case 2 & 3: Guest empty, load cloud or cached session
            const cachedHasData = Boolean(
              (cachedUser.recipes && cachedUser.recipes.length > 0) ||
              (cachedUser.customItems && cachedUser.customItems.length > 0) ||
              (cachedUser.itemOverrides && Object.keys(cachedUser.itemOverrides).length > 0)
            );
            const activeSess = cloudSession || (cachedHasData ? cachedUser : (cachedUser.id !== EMPTY_GROCERY_SESSION.id ? cachedUser : { ...EMPTY_GROCERY_SESSION, id: generateUUID() }));
            setGrocerySession(activeSess);
            saveGrocerySession(activeSess, session.user.id);
          }
        } catch {
          const cachedUser = readGrocerySession(session.user.id);
          const cachedHasData = Boolean(
            (cachedUser.recipes && cachedUser.recipes.length > 0) ||
            (cachedUser.customItems && cachedUser.customItems.length > 0) ||
            (cachedUser.itemOverrides && Object.keys(cachedUser.itemOverrides).length > 0)
          );
          if (cachedHasData) {
            setGrocerySession(cachedUser);
          }
        }
      } catch (error) {
        if (active) {
          console.error("[Account Sync Error]:", error);
          setAccount((current) => ({ ...current, loading: false }));
          const msg = "Couldn't reach your cookbook. Check your connection and try again.";
          setNotice(msg);
          addToast(msg, "error");
        }
      }
    };
    getSession()
      .then(hydrate)
      .catch((error) => {
        if (active) {
          console.error("[Auth Restore Error]:", error);
          setAccount((current) => ({ ...current, session: null, loading: false }));
          const msg = "Couldn't reach your cookbook. Check your connection and try again.";
          setNotice(msg);
          addToast(msg, "error");
        }
      });
    const stopWatching = watchSession(hydrate);
    return () => {
      active = false;
      stopWatching();
    };
  }, [addToast, flushGroceryQueue]);

  // Realtime channel subscription for multi-device sync
  useEffect(() => {
    const userId = account.session?.user?.id;
    if (!userId || !grocerySession?.id) return undefined;

    const unsubscribe = subscribeGrocerySession(grocerySession.id, (message) => {
      if (message.ackMutationIds) {
        ackGroceryMutations(message.ackMutationIds, userId);
      }
      if (message.session) {
        const remaining = readGroceryQueue(userId);
        const rebased = rebaseMutationsOverSession(message.session, remaining);
        setGrocerySession(rebased);
        saveGrocerySession(rebased, userId);
      } else if (message.activeSession && message.completedSessionId === grocerySession.id) {
        // Session was completed by peer device
        clearGroceryQueue(userId);
        setGrocerySession(message.activeSession);
        saveGrocerySession(message.activeSession, userId);
        addToast("Grocery trip was completed on another device.", "info");
      }
    });

    return () => {
      unsubscribe();
    };
  }, [account.session?.user?.id, addToast, grocerySession?.id]);

  // Online / Offline synchronization
  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus("saved");
      const userId = account.session?.user?.id;
      if (userId) {
        flushGroceryQueue(userId);
      }
    };
    const handleOffline = () => {
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSyncStatus("offline");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [account.session?.user?.id, flushGroceryQueue]);

  // Keep authenticated library cached in local storage for offline access
  useEffect(() => {
    if (!account.session?.user?.id) return;
    saveAccountLibrary(account.session.user.id, account.library);
  }, [account.session?.user?.id, account.library]);

  const commitLocal = (next) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setLibrary(next);
      return "";
    } catch {
      const message =
        "Your browser couldn't save this change. Free up some storage before trying again.";
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
    const targetRecipe =
      remoteRecipes[id] ||
      Object.values(remoteRecipes).find((r) => r && r.id === id) ||
      allRecipes.find((r) => r.id === id);
    setAccount((current) => {
      const currentShared = current.library.sharedRecipes || [];
      let nextShared = currentShared;
      if (wasFavorite) {
        nextShared = currentShared.filter((r) => r.id !== id);
      } else if (
        targetRecipe &&
        !personalRecipes.some((r) => r.id === id) &&
        !currentShared.some((r) => r.id === id)
      ) {
        nextShared = [...currentShared, targetRecipe];
      }
      return {
        ...current,
        library: { ...current.library, favorites, sharedRecipes: nextShared },
      };
    });
    try {
      const effectiveToken =
        (targetRecipe && targetRecipe.shareToken) ||
        (isSharedRoute && shareToken) ||
        null;
      await setAccountFavorite(
        account.session.user.id,
        id,
        !wasFavorite,
        effectiveToken,
      );
    } catch (error) {
      setAccount((current) => ({
        ...current,
        library: {
          ...current.library,
          favorites: activeLibrary.favorites,
          sharedRecipes: activeLibrary.sharedRecipes || [],
        },
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
      recipe,
      ...personalRecipes.filter((item) => item.id !== recipe.id),
    ];

    const forkedFromId = editor?.forkedFromId;
    const wasForkedFavorite = Boolean(
      forkedFromId && activeLibrary.favorites.includes(forkedFromId),
    );
    let nextFavorites = activeLibrary.favorites;
    if (wasForkedFavorite) {
      nextFavorites = nextFavorites.filter((id) => id !== forkedFromId);
      if (!nextFavorites.includes(recipe.id)) {
        nextFavorites = [...nextFavorites, recipe.id];
      }
    }

    if (account.session) {
      try {
        await saveAccountRecipe(account.session.user.id, recipe);
        if (wasForkedFavorite) {
          await setAccountFavorite(account.session.user.id, forkedFromId, false).catch(() => {});
          await setAccountFavorite(account.session.user.id, recipe.id, true).catch(() => {});
        }
        setAccount((current) => ({
          ...current,
          library: {
            ...current.library,
            recipes: nextRecipes,
            favorites: nextFavorites,
            sharedRecipes: (current.library.sharedRecipes || []).filter(
              (r) => r.id !== forkedFromId,
            ),
            progress,
          },
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
    const error = commitLocal({
      ...library,
      recipes: nextRecipes,
      favorites: nextFavorites,
      progress,
    });
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

  const handleAddRecipeClick = () => {
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
    const isOwned = recipe && personalRecipes.some((r) => r.id === recipe.id);
    setEditor({
      recipe,
      fromIntake: !recipe,
      forkedFromId: recipe && !isOwned ? recipe.id : null,
    });
  };
  const beginSignIn = () => {
    setAuthModal({ open: true, intent: "signin", error: "" });
  };
  const handleAuthModalSignIn = async (credentials) => {
    try {
      await signInWithGoogle(credentials);
    } catch (error) {
      setAuthModal((prev) => ({ ...prev, error: error.message }));
      addToast(`Google sign-in could not start: ${error.message}`, "error");
    }
  };
  const closeAuthModal = () => {
    setAuthModal((prev) => ({ ...prev, open: false, error: "" }));
    if (window.location.hash === "#/login") {
      window.location.hash = "#/";
    }
    if (
      authModal.intent === "groceries" &&
      route === "groceries" &&
      !account.session
    ) {
      window.location.hash = "#/";
    }
  };

  const searchByTag = (tag) => {
    const query = tag.trim();
    if (!query) return;
    setShelfState((state) => ({
      ...state,
      query,
      category: "",
      collection: "all",
    }));
    window.location.hash = "/";
  };
  const endSession = async () => {
    try {
      await signOut();
      accountMenu.current?.removeAttribute("open");
      setGrocerySession(readGrocerySession(null));
      setRemoteRecipes({});
      setNotFoundRemoteIds(new Set());
      setLoadingRemoteId(null);
      setShelfState((state) => ({
        ...state,
        collection: state.collection === "my-recipes" ? "all" : state.collection,
      }));
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
        className="recipe-skip fixed top-4 left-4 z-[200] bg-ink text-white px-5 py-3.5 -translate-y-[150%] focus:translate-y-0 transition-transform font-medium text-sm rounded shadow-lg"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("recipe-main")?.focus();
        }}
      >
        Skip to recipes
      </a>
      <AppHeader
        account={account}
        accountMenuRef={accountMenu}
        cloudAvailable={cloudEnabled}
        favoriteCount={activeLibrary.favorites.length}
        groceryRecipeCount={grocerySession.recipes?.length || 0}
        onAddRecipe={handleAddRecipeClick}
        onSignIn={beginSignIn}
        onSignOut={endSession}
        personalRecipeCount={personalRecipes.length}
        route={route}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <AuthModal
        isOpen={authModal.open}
        onClose={closeAuthModal}
        onSignIn={handleAuthModalSignIn}
        loading={account.loading}
        errorMessage={authModal.error}
        initialIntent={authModal.intent}
      />
      <AddRecipeModal
        isOpen={addRecipeModalOpen}
        onClose={() => setAddRecipeModalOpen(false)}
        onSelectManual={() =>
          setEditor({ recipe: null, fromIntake: true, forkedFromId: null })
        }
        onParsedRecipe={(parsedRecipe) => {
          setEditor({
            recipe: parsedRecipe,
            fromIntake: true,
            forkedFromId: null,
          });
          addToast("Recipe structured with Gemini AI!", "success");
        }}
        requireAuth={cloudEnabled && !account.session}
        onRequireAuth={() => {
          setAddRecipeModalOpen(false);
          setAuthModal({
            open: true,
            intent: "create",
            error: "",
          });
          setNotice("Sign in with Google to create and manage your recipes.");
        }}
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
      {route === "groceries" ? (
        <GroceryListView
          session={grocerySession}
          recipes={allRecipes}
          onUpdateSession={updateGrocerySession}
          onDispatchMutation={dispatchGroceryMutation}
          onCompleteTrip={handleCompleteTrip}
          syncStatus={syncStatus}
          onToast={addToast}
        />
      ) : route ? (
        current ? (
          <RecipeDetail
            key={current.id}
            recipe={current}
            favorite={activeLibrary.favorites.includes(current.id)}
            onFavorite={favorite}
            progress={activeLibrary.progress[current.id]}
            onProgress={(progress) => updateProgress(current.id, progress)}
            onEdit={(recipe) => openEditor(recipe)}
            onSearchTag={searchByTag}
            isLocal={personalRecipes.some((recipe) => recipe.id === current.id)}
            isCloud={Boolean(account.session)}
            inGroceries={(grocerySession.recipes || []).some(
              (r) => r.recipeId === current.id,
            )}
            onToggleGroceries={toggleRecipeInGroceries}
            onToast={addToast}
          />
        ) : loadingRemoteId === route ? (
          <main
            className="empty-state loading-recipe min-h-[65svh] flex flex-col items-center justify-center text-center p-8 gap-4"
            id="recipe-main"
            tabIndex={-1}
            aria-live="polite"
          >
            <div className="w-8 h-8 rounded-full border-2 border-[#b4aca0] border-t-ink spin-icon" />
            <p className="text-muted text-sm m-0">Loading recipe...</p>
          </main>
        ) : (
          <main
            className="empty-state missing-recipe min-h-[65svh] flex flex-col items-center justify-center text-center p-8 gap-4"
            id="recipe-main"
            tabIndex={-1}
          >
            <BookOpen size={40} strokeWidth={1.2} className="text-muted" />
            <h1 className="font-serif text-3xl font-normal text-ink m-0">This recipe isn't on the shelf.</h1>
            <p className="text-muted text-sm max-w-md m-0">
              It may be saved on another device.
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
          isLoggedIn={Boolean(account.session)}
          personalRecipeIds={personalRecipeIds}
          onAdd={handleAddRecipeClick}
        />
      )}
      <AppFooter />
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
          onBack={
            editor.fromIntake
              ? () => {
                  setEditor(null);
                  setAddRecipeModalOpen(true);
                }
              : null
          }
        />
      )}
      {guestMergeModal.open && (
        <div className="modal-backdrop">
          <div
            className="modal-panel grocery-guest-merge-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-merge-title"
          >
            <div className="modal-header">
              <h2 id="guest-merge-title">Sync Grocery Lists</h2>
            </div>
            <p className="modal-lead">
              You have an active grocery list on this device and an existing grocery trip in your account.
            </p>
            <p className="shelf-counter">
              How would you like to handle these items?
            </p>
            <div className="grocery-guest-merge-actions">
              <button
                type="button"
                className="button button--accent"
                onClick={() => {
                  const userId = account.session?.user?.id;
                  const merged = mergeGuestIntoAccountSession(
                    guestMergeModal.guestSession,
                    guestMergeModal.cloudSession,
                  );
                  setGrocerySession(merged);
                  saveGrocerySession(merged, userId);
                  saveGrocerySession(EMPTY_GROCERY_SESSION, null);
                  setGuestMergeModal({ open: false, guestSession: null, cloudSession: null });
                  addToast("Guest and account grocery lists merged.", "success");

                  if (userId) {
                    (guestMergeModal.guestSession?.recipes || []).forEach((r) => {
                      enqueueGroceryMutation({
                        mutationId: generateUUID(),
                        sessionId: merged.id,
                        deviceId: getDeviceId(),
                        type: "RECIPE_ADDED",
                        targetId: r.recipeId,
                        payload: { servings: r.servings },
                        observedRevision: merged.revision,
                        clientTimestamp: Date.now(),
                      }, userId);
                    });
                    (guestMergeModal.guestSession?.customItems || []).forEach((c) => {
                      enqueueGroceryMutation({
                        mutationId: generateUUID(),
                        sessionId: merged.id,
                        deviceId: getDeviceId(),
                        type: "CUSTOM_ITEM_ADDED",
                        targetId: c.id,
                        payload: c,
                        observedRevision: merged.revision,
                        clientTimestamp: Date.now(),
                      }, userId);
                    });
                    flushGroceryQueue(userId);
                  }
                }}
              >
                Merge guest items with account trip
              </button>
              <button
                type="button"
                className="button button--light"
                onClick={() => {
                  const userId = account.session?.user?.id;
                  setGrocerySession(guestMergeModal.cloudSession);
                  saveGrocerySession(guestMergeModal.cloudSession, userId);
                  saveGrocerySession(EMPTY_GROCERY_SESSION, null);
                  setGuestMergeModal({ open: false, guestSession: null, cloudSession: null });
                  addToast("Kept account grocery trip.", "info");
                }}
              >
                Keep account trip only
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
