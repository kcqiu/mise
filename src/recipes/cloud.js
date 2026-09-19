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

let customClient = null;

export function setSupabaseClientForTesting(client) {
  customClient = client;
}

const getClient = () => customClient || supabase;

const throwIfError = ({ error }) => {
  if (error) throw error;
};

export async function getSession() {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function watchSession(callback) {
  const client = getClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => callback(session), 0);
  });
  return () => data?.subscription?.unsubscribe?.();
}

export async function signInWithGoogle({ idToken, nonce } = {}) {
  const client = getClient();
  if (!client) return;
  if (!idToken) {
    throw new Error("Google did not return a sign-in credential.");
  }
  const { data, error } = await client.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce,
  });
  if (error) throw error;
  return data;
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
  const client = getClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadAccountLibrary(userId) {
  const client = getClient();
  if (!client) return { recipes: [], favorites: [], sharedRecipes: [], progress: {} };
  const [recipesResult, favoritesResult, progressResult] = await Promise.all([
    client
      .from("recipes")
      .select("id, payload")
      .eq("owner_id", userId)
      .eq("is_system", false)
      .order("updated_at", { ascending: false }),
    client.from("favorites").select("recipe_id").eq("user_id", userId),
    client
      .from("recipe_progress")
      .select("recipe_id, progress")
      .eq("user_id", userId),
  ]);
  throwIfError(recipesResult);
  throwIfError(favoritesResult);
  throwIfError(progressResult);

  const favoriteIds = favoritesResult.data.map(({ recipe_id }) => recipe_id);
  const ownedRecipeIds = new Set(recipesResult.data.map(({ id }) => id));
  const externalFavoriteIds = favoriteIds.filter((id) => !ownedRecipeIds.has(id));

  let sharedRecipes = [];
  if (externalFavoriteIds.length > 0) {
    try {
      const sharedResult = await client
        .from("recipes")
        .select("id, payload")
        .in("id", externalFavoriteIds);
      if (!sharedResult.error && Array.isArray(sharedResult.data)) {
        sharedRecipes = sharedResult.data.map(({ id, payload }) => ({
          ...payload,
          id,
          isShared: true,
        }));
      }
    } catch {
      // Gracefully continue with available local data if external lookup fails
    }
  }

  return {
    recipes: recipesResult.data.map(({ id, payload }) => ({ ...payload, id })),
    sharedRecipes,
    favorites: favoriteIds,
    progress: Object.fromEntries(
      progressResult.data.map(({ recipe_id, progress }) => [
        recipe_id,
        progress,
      ]),
    ),
  };
}

export async function loadRecipeById(recipeId) {
  const client = getClient();
  if (!client || !recipeId) return null;
  const result = await client
    .from("recipes")
    .select("id, payload")
    .eq("id", recipeId)
    .maybeSingle();
  if (result.error) {
    console.error("Failed to load recipe by id:", result.error);
    return null;
  }
  if (!result.data || !result.data.payload) return null;
  return { ...result.data.payload, id: result.data.id };
}

export async function getOrCreateRecipeShare(recipeId) {
  const client = getClient();
  if (!client || !recipeId) return null;
  try {
    const { data, error } = await client.rpc("get_or_create_recipe_share", {
      p_recipe_id: recipeId,
    });
    if (error) {
      console.error("Failed to get or create recipe share:", error);
      return null;
    }
    return data?.share_token || null;
  } catch (err) {
    console.error("Failed to get or create recipe share:", err);
    return null;
  }
}

export async function loadRecipeByShareToken(token) {
  const client = getClient();
  if (!client || !token) return null;
  try {
    const { data, error } = await client.rpc("get_shared_recipe", {
      p_token: token,
    });
    if (error) {
      console.error("Failed to load shared recipe by token:", error);
      return null;
    }
    if (!data) return null;

    if (
      typeof data.artwork === "string" &&
      data.artwork.includes("/recipe-covers/")
    ) {
      try {
        const signedUrl = await getSharedCoverUrl(token);
        if (signedUrl) {
          data.artwork = signedUrl;
        }
      } catch {
        // Fall back to original artwork
      }
    }

    return data;
  } catch (err) {
    console.error("Failed to load shared recipe by token:", err);
    return null;
  }
}

export async function revokeRecipeShare(recipeId) {
  const client = getClient();
  if (!client || !recipeId) return false;
  try {
    const { data, error } = await client.rpc("revoke_recipe_share", {
      p_recipe_id: recipeId,
    });
    if (error) {
      console.error("Failed to revoke recipe share:", error);
      return false;
    }
    return Boolean(data?.success);
  } catch (err) {
    console.error("Failed to revoke recipe share:", err);
    return false;
  }
}

export async function saveAccountRecipe(userId, recipe) {
  const client = getClient();
  if (!client) return;
  const result = await client.from("recipes").upsert(
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
  const client = getClient();
  if (!client) return;
  const result = await client
    .from("recipes")
    .delete()
    .eq("id", recipeId)
    .eq("owner_id", userId);
  throwIfError(result);
}

export async function favoriteSharedRecipe(token) {
  const client = getClient();
  if (!client || !token) return null;
  const { data, error } = await client.rpc("favorite_shared_recipe", {
    p_share_token: token,
  });
  if (error) {
    console.error("Failed to favorite shared recipe:", error);
    throw error;
  }
  return data;
}

export async function getSharedCoverUrl(token) {
  if (!token) return null;
  try {
    const res = await fetch(
      `/api/ai/shared-cover?token=${encodeURIComponent(token)}`,
    );
    if (res.ok) {
      const data = await res.json();
      return data.signedUrl || null;
    }
  } catch {
    // Non-fatal
  }
  return null;
}

export async function setAccountFavorite(
  userId,
  recipeId,
  favorite,
  shareToken = null,
) {
  const client = getClient();
  if (!client) return;
  if (favorite) {
    if (shareToken) {
      try {
        const { error } = await client.rpc("favorite_shared_recipe", {
          p_share_token: shareToken,
        });
        if (!error) return;
      } catch {
        // Fall back to direct upsert if RPC is unavailable
      }
    }
    const result = await client.from("favorites").upsert(
      { user_id: userId, recipe_id: recipeId },
      {
        onConflict: "user_id,recipe_id",
        ignoreDuplicates: true,
      },
    );
    throwIfError(result);
  } else {
    const result = await client
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", recipeId);
    throwIfError(result);
  }
}

export async function setAccountProgress(userId, recipeId, progress) {
  const client = getClient();
  if (!client) return;
  const result = await client.from("recipe_progress").upsert(
    { user_id: userId, recipe_id: recipeId, progress },
    { onConflict: "user_id,recipe_id" },
  );
  throwIfError(result);
}

export async function importAccountLibrary(userId, library) {
  const client = getClient();
  if (!client) return;
  if (library.recipes.length) {
    const result = await client.from("recipes").upsert(
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
    const result = await client.from("favorites").upsert(
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
  const client = getClient();
  if (!client || !userId) return null;
  const ext =
    fileOrBlob.type === "image/png"
      ? "png"
      : fileOrBlob.type === "image/jpeg"
        ? "jpg"
        : "webp";
  const filePath = `${userId}/${recipeId}-${Date.now()}.${ext}`;
  const { data, error } = await client.storage
    .from("recipe-covers")
    .upload(filePath, fileOrBlob, {
      cacheControl: "31536000",
      upsert: true,
      contentType: fileOrBlob.type || "image/webp",
    });
  if (error) throw error;

  // Private bucket: generate 1-year signed URL for owner and share recipients
  try {
    const { data: signedData, error: signError } = await client.storage
      .from("recipe-covers")
      .createSignedUrl(data.path, 31536000); // 1 year in seconds

    if (signedData?.signedUrl && !signError) {
      return signedData.signedUrl;
    }
  } catch {
    // Fallback if createSignedUrl fails
  }

  const { data: publicData } = client.storage
    .from("recipe-covers")
    .getPublicUrl(data.path);
  return publicData?.publicUrl || null;
}

export async function deleteRecipeCover(coverUrl) {
  const client = getClient();
  if (!client || !coverUrl || !coverUrl.includes("/recipe-covers/")) return;
  try {
    const parts = coverUrl.split("/recipe-covers/");
    if (parts.length === 2) {
      // Strip query parameters (?token=...) from signed URLs
      const rawPath = parts[1].split("?")[0];
      await client.storage.from("recipe-covers").remove([decodeURIComponent(rawPath)]);
    }
  } catch {
    // Non-blocking cleanup
  }
}

// -----------------------------------------------------------------------------
// Phase 2: Groceries Cloud Synchronization & Realtime
// -----------------------------------------------------------------------------


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
    if (data?.code === "REVISION_CONFLICT") {
      return {
        success: false,
        code: "REVISION_CONFLICT",
        sessionId: data.sessionId,
        currentRevision: Number(data.currentRevision || data.session?.revision),
        session: (data.session || data.currentSession)
          ? dbRecordToGrocerySession(data.session || data.currentSession)
          : null,
        currentSession: (data.currentSession || data.session)
          ? dbRecordToGrocerySession(data.currentSession || data.session)
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
      private: true,
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
  const channel = client.channel(`grocery:${sessionId}`, {
    config: {
      private: true,
      broadcast: { self: false },
    },
  });
  await channel.send({
    type: "broadcast",
    event: "grocery_mutations",
    payload,
  });
}
