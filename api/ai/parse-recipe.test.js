import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./parse-recipe.js";
import { resetRateLimitsForTesting } from "../../server/aiAuth.js";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

// Mock DNS lookup inside safeUrlFetch
vi.mock("node:dns/promises", () => ({
  default: {
    lookup: vi.fn(async (hostname) => {
      if (hostname === "private.corp") {
        return [{ address: "10.0.0.1", family: 4 }];
      }
      if (hostname === "loopback.attacker.com") {
        return [{ address: "127.0.0.1", family: 4 }];
      }
      if (hostname === "metadata.internal") {
        return [{ address: "169.254.169.254", family: 4 }];
      }
      // Public default
      return [{ address: "93.184.216.34", family: 4 }];
    }),
  },
}));

beforeEach(() => {
  resetRateLimitsForTesting();
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubGlobal("fetch", vi.fn());
  generateContent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function invoke(body, headers = {}) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  await handler(
    {
      method: "POST",
      headers: { authorization: "Bearer test-valid-token", ...headers },
      body,
    },
    res,
  );
  return {
    status: res.status.mock.calls.at(-1)[0],
    body: res.json.mock.calls.at(-1)[0],
  };
}

describe("parse-recipe handler - Authentication & Rate Limiting", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = await invoke({ mode: "text", text: "soup" }, { authorization: "" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("rejects invalid token with 401", async () => {
    const res = await invoke(
      { mode: "text", text: "soup" },
      { authorization: "Bearer invalid-token-xyz" },
    );
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("enforces 30 requests/hour rate limit", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ title: "Quick Soup", category: "Soups", ingredients: [], steps: [] }) });

    // Call 30 times
    for (let i = 0; i < 30; i++) {
      const okRes = await invoke({ mode: "text", text: `soup ${i}` });
      expect(okRes.status).toBe(200);
    }

    // 31st call should be throttled with 429
    const throttled = await invoke({ mode: "text", text: "soup 31" });
    expect(throttled.status).toBe(429);
    expect(throttled.body.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});

describe("parse-recipe handler - SSRF protection for mode: 'url'", () => {
  it.each([
    ["http://127.0.0.1:8080/secret", /Only HTTPS/i],
    ["http://example.com/recipe", /Only HTTPS/i],
    ["ftp://example.com/recipe", /Only HTTPS/i],
  ])("rejects non-HTTPS URL %s with HTTP 400", async (targetUrl, errorRegex) => {
    const res = await invoke({ mode: "url", url: targetUrl });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(errorRegex);
    expect(fetch).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([
    ["https://admin:pass@example.com/recipe", /credentials are not allowed/i],
    ["https://example.com:8443/recipe", /Custom ports \(8443\) are not allowed/i],
    ["https://localhost/recipe", /localhost is forbidden/i],
    ["https://service.internal/recipe", /local or private domain names is forbidden/i],
    ["https://127.0.0.1/recipe", /private, loopback, or restricted IP addresses is forbidden/i],
    ["https://10.0.0.1/recipe", /private, loopback, or restricted IP addresses is forbidden/i],
    ["https://169.254.169.254/latest/meta-data/", /private, loopback, or restricted IP addresses is forbidden/i],
    ["https://[::1]/recipe", /private, loopback, or restricted IP addresses is forbidden/i],
    ["https://[::ffff:127.0.0.1]/recipe", /private, loopback, or restricted IP addresses is forbidden/i],
    ["https://private.corp/recipe", /resolved to forbidden address "10.0.0.1"/i],
    ["https://loopback.attacker.com/recipe", /resolved to forbidden address "127.0.0.1"/i],
  ])("blocks SSRF target %s with HTTP 400 without fetching", async (targetUrl, errorRegex) => {
    const res = await invoke({ mode: "url", url: targetUrl });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(errorRegex);
    expect(fetch).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("fetches public HTTPS website, extracts recipe schema, and parses recipe with Gemini", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Recipe",
              "name": "Classic Lasagna",
              "recipeIngredient": ["lasagna noodles", "ricotta", "ground beef", "marinara"],
              "recipeInstructions": ["Brown the beef", "Layer noodles and cheese", "Bake at 375F"]
            }
          </script>
        </head>
        <body>
          <h1>Classic Lasagna</h1>
        </body>
      </html>
    `;

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      text: async () => html,
    });

    const parsedRecipe = {
      title: "Classic Lasagna",
      category: "Dinner",
      ingredients: [{ name: "lasagna noodles" }],
      steps: [{ instruction: "Bake at 375F" }],
    };

    generateContent.mockResolvedValueOnce({
      text: JSON.stringify(parsedRecipe),
    });

    const res = await invoke({
      mode: "url",
      url: "https://example.com/classic-lasagna",
    });

    expect(res.status).toBe(200);
    expect(res.body.recipe).toEqual(parsedRecipe);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects text payload exceeding 100KB with HTTP 413", async () => {
    const hugeText = "a".repeat(105 * 1024);
    const res = await invoke({ mode: "text", text: hugeText });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects non-canonical YouTube URL with HTTP 400", async () => {
    const res = await invoke({
      mode: "social",
      url: "https://youtube.com/invalid-video-path",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/standard YouTube video/i);
  });

  it("rejects non-canonical TikTok URL with HTTP 400", async () => {
    const res = await invoke({
      mode: "social",
      url: "https://tiktok.com/invalid-path",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/standard TikTok video/i);
  });

  it("rejects non-canonical TikTok short URL with HTTP 400", async () => {
    const res = await invoke({
      mode: "social",
      url: "https://vt.tiktok.com/",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/standard TikTok video/i);
  });

  it("accepts valid vt.tiktok.com and vm.tiktok.com short URLs", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        title: "TikTok Pasta",
        category: "Dinner",
        ingredients: [{ name: "Pasta", quantity: 200, unit: "g" }],
        steps: [{ instruction: "Boil pasta." }],
      }),
    });

    const res = await invoke({
      mode: "social",
      url: "https://vt.tiktok.com/ZS12345abc/",
      caption: "Quick garlic pasta recipe",
    });
    expect(res.status).toBe(200);
    expect(res.body.recipe.title).toBe("TikTok Pasta");
  });
});
