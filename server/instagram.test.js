import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchInstagramCaption, instagramPostUrl } from "./instagram.js";
import handler from "../api/ai/parse-recipe.js";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent }; },
}));

const url = "https://www.instagram.com/reel/CvvEAHStYXS/?igsh=tracking";
const canonical = "https://www.instagram.com/reel/CvvEAHStYXS/";
const caption = "Matcha latte: whisk 1 tsp matcha with 2 tbsp water. Add 1 cup milk.";
const recipe = { title: "Matcha latte", ingredients: [{ name: "matcha" }], steps: [{ instruction: "Whisk matcha with water." }] };
const providerPost = { shortcode: "CvvEAHStYXS", url: "https://www.instagram.com/p/CvvEAHStYXS/", caption, author: "chef" };

import { resetRateLimitsForTesting } from "./aiAuth.js";

beforeEach(() => {
  resetRateLimitsForTesting();
  vi.stubEnv("CHOCODATA_API_KEY", "test-chocodata-key");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubGlobal("fetch", vi.fn());
  generateContent.mockReset();
  generateContent.mockResolvedValue({ text: JSON.stringify(recipe) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function respond(data, status = 200) {
  fetch.mockResolvedValueOnce({ ok: status === 200, status, json: async () => data });
}
async function invoke(body) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer test-valid-token" },
      body: { mode: "social", url, ...body },
    },
    res,
  );
  return { status: res.status.mock.calls.at(-1)[0], body: res.json.mock.calls.at(-1)[0] };
}

describe("Instagram caption provider", () => {
  it("normalizes Reel links and requests only the documented ChocoData post endpoint", async () => {
    respond(providerPost);
    expect(await fetchInstagramCaption(url)).toMatchObject({ caption, author: "chef", canonicalUrl: canonical });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetch.mock.calls[0];
    expect(endpoint.origin + endpoint.pathname).toBe("https://api.chocodata.com/api/v1/instagram/post");
    expect(Object.fromEntries(endpoint.searchParams)).toEqual({ api_key: "test-chocodata-key", shortcode: "CvvEAHStYXS" });
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeDefined();
  });

  it.each(["http://instagram.com/p/Abcde/", "https://instagram.com.evil.test/p/Abcde/", "https://instagram.com/chef/", "https://instagram.com:444/p/Abcde/", "https://user:password@instagram.com/p/Abcde/", "not a URL"])("rejects invalid input %s", (value) => {
    expect(instagramPostUrl(value)).toBeNull();
  });

  it("does not substitute Meta credentials when ChocoData is unconfigured", async () => {
    vi.stubEnv("CHOCODATA_API_KEY", "");
    vi.stubEnv("INSTAGRAM_API_KEY", "meta-secret-must-not-be-sent");
    expect(await fetchInstagramCaption(url)).toMatchObject({ caption: "", captionError: expect.stringContaining("not configured") });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([401, 403, 402, 429, 500])("offers pasted-caption recovery on HTTP %s without leaking secrets or retrying", async (status) => {
    respond({ error: "secret test-chocodata-key" }, status);
    const result = await fetchInstagramCaption(url);
    expect(result.caption).toBe("");
    expect(result.captionError).toContain("paste");
    expect(JSON.stringify(result)).not.toContain("test-chocodata-key");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...providerPost, shortcode: "AnotherPost" },
    { ...providerPost, url: "https://instagram.com/p/AnotherPost/" },
    { ...providerPost, caption: "  ", title: "Instagram" },
    { username: "chef", biography: "Food creator" },
    { ...providerPost, error: "upstream blocked" },
    null,
    [providerPost],
  ])("rejects absent captions and unrelated provider results", async (value) => {
    respond(value);
    expect((await fetchInstagramCaption(url)).caption).toBe("");
  });

  it("sanitizes thrown errors, including timeouts and malformed JSON", async () => {
    fetch.mockRejectedValueOnce(new Error("https://api.chocodata.com?api_key=test-chocodata-key"));
    expect(JSON.stringify(await fetchInstagramCaption(url))).not.toContain("test-chocodata-key");
    fetch.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error("invalid JSON"); } });
    expect((await fetchInstagramCaption(url)).captionError).toContain("paste");
  });
});

describe("Instagram recipe import", () => {
  it("imports a ChocoData caption and preserves the canonical Reel URL", async () => {
    respond(providerPost);
    const result = await invoke({});
    expect(result.status).toBe(200);
    expect(result.body.recipe.sourceVideo).toBe(canonical);
    expect(generateContent.mock.calls[0][0].contents.join("\n")).toContain(caption);
  });

  it("bypasses network scraping when the user pastes a caption", async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify({ ...recipe, sourceVideo: "https://instagram.com/reel/WrongPost/" }) });
    const result = await invoke({ caption });
    expect(result.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.body.recipe.sourceVideo).toBe(canonical);
  });

  it("returns requiresCaption without calling Gemini for generic titles or empty captions", async () => {
    respond({ ...providerPost, title: "Instagram", caption: "" });
    expect(await invoke({})).toMatchObject({ status: 422, body: { requiresCaption: true, platform: "instagram.com" } });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("rejects invalid URLs before any provider or AI calls, even with pasted text", async () => {
    expect((await invoke({ url: "https://localhost/private", caption })).status).toBe(400);
    expect((await invoke({ url: "invalid", caption })).status).toBe(400);
    expect((await invoke({ url: "https://instagram.com/chef/", caption })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("asks for recipe text when a caption contains no recipe", async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify({ title: "Follow me", ingredients: [], steps: [] }) });
    expect(await invoke({ caption: "Follow for more!" })).toMatchObject({ status: 422, body: { requiresCaption: true } });
  });
});
