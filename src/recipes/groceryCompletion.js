import {
  EMPTY_GROCERY_SESSION,
  resetGrocerySession,
  rolloverGrocerySession,
} from "./groceries";

const completionMessage = (action) =>
  action === "clear"
    ? "Grocery list cleared"
    : "Completed trip; unpurchased items rolled over";

export async function resolveGroceryCompletion({
  action,
  userId,
  isOnline,
  session,
  recipes,
  newSessionId,
  completeRemote,
}) {
  if (!userId) {
    return {
      ok: true,
      message: completionMessage(action),
      clearQueue: false,
      broadcast: false,
      nextSession:
        action === "clear"
          ? resetGrocerySession(newSessionId)
          : rolloverGrocerySession(session, recipes, newSessionId),
    };
  }

  if (!isOnline) {
    return {
      ok: false,
      error: "Internet connection required to complete trip",
    };
  }

  const rolloverItems =
    action === "rollover"
      ? rolloverGrocerySession(session, recipes, newSessionId).customItems || []
      : [];

  try {
    const response = await completeRemote(
      userId,
      session.id,
      action,
      rolloverItems,
      newSessionId,
      session.revision,
    );

    if (response?.success) {
      return {
        ok: true,
        message: completionMessage(action),
        clearQueue: true,
        broadcast: true,
        nextSession: response.activeSession || EMPTY_GROCERY_SESSION,
      };
    }

    if (response?.code === "REVISION_CONFLICT") {
      return {
        ok: false,
        error:
          "Could not complete trip: your list was updated on another device. Please review the latest list.",
        latestSession: response.session || null,
      };
    }
  } catch {
    // The caller receives one consistent failure result for thrown network errors.
  }

  return {
    ok: false,
    error: "Could not complete trip. Your grocery list was not changed.",
  };
}

