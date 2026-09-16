const DUPLICATE_WINDOW_MS = 1_200;

export function appendToast(currentToasts, nextToast) {
  const latest = currentToasts.at(-1);
  const isRecentExactDuplicate =
    latest &&
    latest.message === nextToast.message &&
    latest.type === nextToast.type &&
    (latest.title || "") === (nextToast.title || "") &&
    nextToast.createdAt - (latest.createdAt || 0) < DUPLICATE_WINDOW_MS;

  if (isRecentExactDuplicate) return currentToasts;
  return [...currentToasts.slice(-4), nextToast];
}

