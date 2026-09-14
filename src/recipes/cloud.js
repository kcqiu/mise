import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const cloudEnabled = Boolean(url && publishableKey);
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
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
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
