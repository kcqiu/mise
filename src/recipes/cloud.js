import { createClient } from "@supabase/supabase-js";
import { dbRecordToGrocerySession } from "./groceries";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const cloudEnabled =
  import.meta.env.MODE !== "test" && Boolean(url && publishableKey);
export const supabase = cloudEnabled
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : null;

const throwIfError = ({ error }) => {
  if (error) throw error;
};

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function watchSession(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => callback(session), 0);
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle() {
  const client = customClient || supabase;
  if (!client) return;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export function extractAuthErrorFromUrl() {
  if (typeof window === "undefined") return null;
  const searchParams = new URLSearchParams(window.location.search);
  let hash = window.location.hash.slice(1);
  let hashParams = new URLSearchParams();
  if (hash.includes("error=") || hash.includes("error_description=")) {
    const queryPart = hash.includes("?") ? hash.split("?")[1] : hash;
    hashParams = new URLSearchParams(queryPart);
  }

  const error = searchParams.get("error") || hashParams.get("error");
  const errorDescription =
    searchParams.get("error_description") ||
    hashParams.get("error_description");

  if (error || errorDescription) {
    const rawMsg = errorDescription || error;
    const cleanHash =
      window.location.hash.startsWith("#/recipe/")
        ? window.location.hash.split("?")[0]
        : "#/";
    window.history.replaceState(
      null,
      "",
      window.location.pathname + cleanHash,
    );
    return decodeURIComponent(rawMsg.replace(/\+/g, " "));
  }
  return null;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadAccountLibrary(userId) {
  if (!supabase) return { recipes: [], favorites: [], progress: {} };
  const [recipesResult, favoritesResult, progressResult] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, payload")
      .eq("owner_id", userId)
      .eq("is_system", false)
      .order("updated_at", { ascending: false }),
    supabase.from("favorites").select("recipe_id").eq("user_id", userId),
    supabase
      .from("recipe_progress")
      .select("recipe_id, progress")
      .eq("user_id", userId),
  ]);
  throwIfError(recipesResult);
  throwIfError(favoritesResult);
  throwIfError(progressResult);
  return {
    recipes: recipesResult.data.map(({ id, payload }) => ({ ...payload, id })),
    favorites: favoritesResult.data.map(({ recipe_id }) => recipe_id),
    progress: Object.fromEntries(
      progressResult.data.map(({ recipe_id, progress }) => [
        recipe_id,
        progress,
      ]),
    ),
  };
}

export async function saveAccountRecipe(userId, recipe) {
  const result = await supabase.from("recipes").upsert(
    {
      id: recipe.id,
      owner_id: userId,
      is_system: false,
      payload: recipe,
    },
    { onConflict: "id" },
  );
  throwIfError(result);
}

export async function deleteAccountRecipe(userId, recipeId) {
  const result = await supabase
    .from("recipes")
    .delete()
    .eq("id", recipeId)
    .eq("owner_id", userId);
  throwIfError(result);
}

export async function setAccountFavorite(userId, recipeId, favorite) {
  const result = favorite
    ? await supabase
        .from("favorites")
        .upsert(
          { user_id: userId, recipe_id: recipeId },
          {
            onConflict: "user_id,recipe_id",
            ignoreDuplicates: true,
          },
        )
    : await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("recipe_id", recipeId);
  throwIfError(result);
}

export async function setAccountProgress(userId, recipeId, progress) {
  const result = await supabase.from("recipe_progress").upsert(
    { user_id: userId, recipe_id: recipeId, progress },
    { onConflict: "user_id,recipe_id" },
  );
  throwIfError(result);
}

export async function importAccountLibrary(userId, library) {
  if (library.recipes.length) {
    const result = await supabase.from("recipes").upsert(
      library.recipes.map((recipe) => ({
        id: recipe.id,
        owner_id: userId,
        is_system: false,
        payload: recipe,
      })),
      { onConflict: "id" },
    );
    throwIfError(result);
  }
  if (library.favorites.length) {
    const result = await supabase.from("favorites").upsert(
      library.favorites.map((recipeId) => ({
        user_id: userId,
        recipe_id: recipeId,
      })),
      { onConflict: "user_id,recipe_id", ignoreDuplicates: true },
    );
    throwIfError(result);
  }
  const progressRows = Object.entries(library.progress || {}).map(
    ([recipeId, progress]) => ({
      user_id: userId,
      recipe_id: recipeId,
      progress,
    }),
  );
  if (progressRows.length) {
    const result = await supabase
      .from("recipe_progress")
      .upsert(progressRows, { onConflict: "user_id,recipe_id" });
    throwIfError(result);
  }
}

export async function uploadRecipeCover(fileOrBlob, recipeId, userId) {
  if (!supabase || !userId) return null;
  const ext =
    fileOrBlob.type === "image/png"
      ? "png"
      : fileOrBlob.type === "image/jpeg"
        ? "jpg"
        : "webp";
  const filePath = `${userId}/${recipeId}-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from("recipe-covers")
    .upload(filePath, fileOrBlob, {
      cacheControl: "31536000",
      upsert: true,
      contentType: fileOrBlob.type || "image/webp",
    });
  if (error) throw error;
  const { data: publicData } = supabase.storage
    .from("recipe-covers")
    .getPublicUrl(data.path);
  return publicData.publicUrl;
}

export async function deleteRecipeCover(publicUrl) {
  if (!supabase || !publicUrl || !publicUrl.includes("/recipe-covers/")) return;
  try {
    const parts = publicUrl.split("/recipe-covers/");
    if (parts.length === 2) {
      await supabase.storage.from("recipe-covers").remove([parts[1]]);
    }
  } catch {
    // Non-blocking cleanup
  }
}

// -----------------------------------------------------------------------------
// Phase 2: Groceries Cloud Synchronization & Realtime
// -----------------------------------------------------------------------------

let customClient = null;

/**
 * For testing purposes only: allows injecting a mock Supabase client.
 */
export function setSupabaseClientForTesting(client) {
  customClient = client;
}

/**
 * Loads the currently active grocery session for the authenticated user.
 */
export async function loadAccountGrocerySession(userId) {
  const client = customClient || supabase;
  if (!client || !userId) {
    return { success: false, session: null, error: new Error("Not authenticated") };
  }
  try {
    const { data, error } = await client.rpc("get_active_grocery_session");
    if (error) throw error;
    if (data?.success) {
      return {
        success: true,
        session: data.session ? dbRecordToGrocerySession(data.session) : null,
        error: null,
      };
    }
    return {
      success: false,
      session: null,
      error: new Error(data?.error || "Failed to load active session"),
    };
  } catch (err) {
    return { success: false, session: null, error: err };
  }
}

async function ensureAccountGrocerySession(client, sessionId) {
  const { data, error } = await client.rpc("ensure_grocery_session", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  if (!data?.success || !data.session) {
    throw new Error(data?.code || "Failed to create grocery session");
  }
  return dbRecordToGrocerySession(data.session);
}

/**
 * Applies a batch of queued mutations atomically on the server.
 */
export async function saveAccountGroceryMutations(userId, sessionId, expectedRevision, mutations) {
  const client = customClient || supabase;
  if (!client || !userId) {
    return { success: false, error: new Error("Not authenticated") };
  }
  try {
    const applyMutations = (targetSessionId, targetRevision) =>
      client.rpc("apply_grocery_mutations", {
        p_session_id: targetSessionId,
        p_expected_revision: targetRevision,
        p_mutations: mutations,
      });

    let { data, error } = await applyMutations(sessionId, expectedRevision);
    if (error) throw error;
    if (data?.code === "SESSION_NOT_FOUND") {
      const activeSession = await ensureAccountGrocerySession(client, sessionId);
      ({ data, error } = await applyMutations(
        activeSession.id,
        activeSession.revision,
      ));
      if (error) throw error;
    }
    if (data?.success) {
      return {
        success: true,
        sessionId: data.sessionId,
        revision: Number(data.revision),
        ackMutationIds: Array.isArray(data.ackMutationIds) ? data.ackMutationIds : [],
        session: data.session ? dbRecordToGrocerySession(data.session) : null,
        error: null,
      };
    }
    if (data?.code === "SESSION_COMPLETED") {
      return {
        success: false,
        code: "SESSION_COMPLETED",
        sessionId: data.sessionId,
        currentActiveSession: data.currentActiveSession
          ? dbRecordToGrocerySession(data.currentActiveSession)
          : null,
        error: null,
      };
    }
    return {
      success: false,
      code: data?.code || "MUTATION_FAILED",
      error: new Error(data?.code || "Failed to apply mutations"),
    };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Completes the active session and creates a rollover or cleared new session.
 */
export async function completeAccountGrocerySession(
  userId,
  sessionId,
  action,
  rolloverCustomItems,
  newSessionId,
  expectedRevision,
) {
  const client = customClient || supabase;
  if (!client || !userId) {
    return { success: false, error: new Error("Not authenticated") };
  }
  try {
    const completeSession = (targetSessionId, targetRevision) =>
      client.rpc("complete_grocery_session", {
        p_session_id: targetSessionId,
        p_action: action,
        p_rollover_custom_items: rolloverCustomItems || [],
        p_new_session_id: newSessionId,
        p_expected_revision: targetRevision,
      });

    let { data, error } = await completeSession(sessionId, expectedRevision);
    if (error) throw error;
    if (
      data?.success &&
      data.code === "ALREADY_COMPLETED" &&
      !data.activeSession
    ) {
      const activeSession = await ensureAccountGrocerySession(client, sessionId);
      ({ data, error } = await completeSession(
        activeSession.id,
        activeSession.revision,
      ));
      if (error) throw error;
    }
    if (data?.success) {
      return {
        success: true,
        action: data.action,
        completedSessionId: data.completedSessionId,
        activeSession: data.activeSession ? dbRecordToGrocerySession(data.activeSession) : null,
        error: null,
      };
    }
    if (data?.code === "REVISION_CONFLICT") {
      return {
        success: false,
        code: "REVISION_CONFLICT",
        currentRevision: Number(data.currentRevision),
        session: data.session ? dbRecordToGrocerySession(data.session) : null,
        error: null,
      };
    }
    return {
      success: false,
      code: data?.code || "COMPLETE_FAILED",
      error: new Error(data?.code || "Failed to complete grocery session"),
    };
  } catch (err) {
    return { success: false, error: err };
  }
}

/**
 * Subscribes to the private realtime channel for a grocery session.
 */
export function subscribeGrocerySession(sessionId, onBroadcastMessage) {
  const client = customClient || supabase;
  if (!client || !sessionId) return () => {};
  const channel = client.channel(`grocery:${sessionId}`, {
    config: {
      broadcast: { self: false },
    },
  });

  channel
    .on("broadcast", { event: "grocery_mutations" }, (payload) => {
      if (typeof onBroadcastMessage === "function" && payload?.payload) {
        onBroadcastMessage(payload.payload);
      }
    })
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Broadcasts committed mutations or state to peer devices on the grocery session channel.
 */
export async function broadcastGroceryMutations(sessionId, payload) {
  const client = customClient || supabase;
  if (!client || !sessionId) return;
  const channel = client.channel(`grocery:${sessionId}`);
  await channel.send({
    type: "broadcast",
    event: "grocery_mutations",
    payload,
  });
}
