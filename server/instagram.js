const CAPTION_HELP = "Open the Instagram post and paste its caption or recipe text below.";

export function instagramPostUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        !["instagram.com", "www.instagram.com"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?$/);
    return match ? { url: `https://www.instagram.com/${match[1]}/${match[2]}/`, shortcode: match[2] } : null;
  } catch {
    return null;
  }
}

function captionRequired(message) {
  return { host: "instagram.com", title: "", caption: "", captionError: `${message} ${CAPTION_HELP}` };
}

// Meta's account APIs cannot resolve arbitrary creators' post URLs. Use a
// separately configured public-post provider; never send Meta secrets to it.
export async function fetchInstagramCaption(value) {
  const post = instagramPostUrl(value);
  if (!post) {
    const error = new Error("Please use a full Instagram post or Reel link (instagram.com/p/... or instagram.com/reel/...).");
    error.status = 400;
    throw error;
  }

  const token = process.env.CHOCODATA_API_KEY?.trim();
  if (!token) return captionRequired("Automatic Instagram caption import is not configured.");

  try {
    // ChocoData supports query authentication only. Keep this URL server-side
    // and never log it or propagate raw fetch errors (which may contain it).
    const endpoint = new URL("https://api.chocodata.com/api/v1/instagram/post");
    endpoint.searchParams.set("api_key", token);
    endpoint.searchParams.set("shortcode", post.shortcode);
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok) {
      // Do not echo provider payloads, request headers, or token-bearing URLs.
      if (response.status === 401 || response.status === 403) {
        return captionRequired("The Instagram caption service could not authenticate.");
      }
      if (response.status === 402 || response.status === 429) {
        return captionRequired("The Instagram caption service has reached its usage or request limit.");
      }
      return captionRequired("The Instagram caption service is temporarily unavailable.");
    }
    const item = await response.json();
    // ChocoData documents a flat post object. Reject errors, profile responses,
    // and mismatched URLs/IDs rather than turning unrelated text into a recipe.
    if (!item || Array.isArray(item) || item.error ||
        item.shortcode !== post.shortcode ||
        (item.url && instagramPostUrl(item.url)?.shortcode !== post.shortcode)) {
      return captionRequired("The Instagram caption service did not return the requested post.");
    }
    const caption = typeof item?.caption === "string" ? item.caption.trim() : "";
    if (!caption) return captionRequired("No caption was available for this post. It may be private, unavailable, or have no caption.");
    return {
      host: "instagram.com",
      title: "",
      caption,
      author: typeof item.author === "string" ? item.author : "",
      canonicalUrl: post.url,
    };
  } catch {
    return captionRequired("The Instagram caption service did not respond successfully.");
  }
}
