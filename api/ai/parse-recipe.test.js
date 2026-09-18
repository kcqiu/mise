import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./parse-recipe.js";

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
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubGlobal("fetch", vi.fn());
  generateContent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function invoke(body) {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
  await handler({ method: "POST", body }, res);
  return {
    status: res.status.mock.calls.at(-1)[0],
    body: res.json.mock.calls.at(-1)[0],
  };
}

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
});
