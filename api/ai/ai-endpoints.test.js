import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import coverHandler from "./generate-cover.js";
import polishHandler from "./polish-recipe.js";
import parseHandler from "./parse-recipe.js";
import { resetRateLimitsForTesting } from "../../server/aiAuth.js";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

beforeEach(() => {
  resetRateLimitsForTesting();
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-cf-token");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-cf-account");
  vi.stubGlobal("fetch", vi.fn());
  generateContent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
}

describe("/api/ai/polish-recipe authentication & rate limiting", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = createMockRes();
    await polishHandler(
      {
        method: "POST",
        headers: {},
        body: { recipe: { title: "Draft Soup" } },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );
  });

  it("enforces 20 requests/hour limit on polish endpoint", async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        title: "Polished Soup",
        category: "Soups",
        ingredients: [],
        steps: [],
      }),
    });

    for (let i = 0; i < 20; i++) {
      const res = createMockRes();
      await polishHandler(
        {
          method: "POST",
          headers: { authorization: "Bearer test-valid-token" },
          body: { recipe: { title: `Draft Soup ${i}` } },
        },
        res,
      );
      expect(res.status).not.toHaveBeenCalledWith(429);
    }

    // 21st request throttled
    const blockedRes = createMockRes();
    await polishHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: { recipe: { title: "Draft Soup 21" } },
      },
      blockedRes,
    );
    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(blockedRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "RATE_LIMIT_EXCEEDED" }),
    );
  });

  it("rejects malformed JSON body with 400", async () => {
    const res = createMockRes();
    await polishHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: "{malformed json",
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid JSON body." }),
    );
  });
});

describe("/api/ai/generate-cover authentication & rate limiting", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = createMockRes();
    await coverHandler(
      {
        method: "POST",
        headers: {},
        body: { recipe: { title: "Apple Pie" } },
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );
  });

  it("enforces 5 requests/hour dual IP and account limit", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: { image: "mock-base64-image" } }),
    });

    for (let i = 0; i < 5; i++) {
      const res = createMockRes();
      await coverHandler(
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-valid-token",
            "x-forwarded-for": "198.51.100.40",
          },
          body: { recipe: { title: `Apple Pie ${i}` } },
        },
        res,
      );
      expect(res.status).not.toHaveBeenCalledWith(429);
    }

    // 6th request throttled
    const blockedRes = createMockRes();
    await coverHandler(
      {
        method: "POST",
        headers: {
          authorization: "Bearer test-valid-token",
          "x-forwarded-for": "198.51.100.40",
        },
        body: { recipe: { title: "Apple Pie 6" } },
      },
      blockedRes,
    );
    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(blockedRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "RATE_LIMIT_EXCEEDED" }),
    );
  });

  it("exempts wode0708@gmail.com from the 5 requests/hour limit", async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: { image: "mock-base64-image" } }),
    });

    // Call 8 times (> 5 limit)
    for (let i = 0; i < 8; i++) {
      const res = createMockRes();
      await coverHandler(
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-owner-token",
            "x-forwarded-for": "198.51.100.40",
          },
          body: { recipe: { title: `Apple Pie ${i}` } },
        },
        res,
      );
      expect(res.status).not.toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "unlimited");
    }
  });

  it("rejects malformed JSON body with 400", async () => {
    const res = createMockRes();
    await coverHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: "{malformed json",
      },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid JSON body." }),
    );
  });
});

describe("AI endpoints - Server Error Sanitization & Information Disclosure (Issue 11)", () => {
  it("sanitizes polish error responses and includes requestId without leaking details", async () => {
    generateContent.mockRejectedValueOnce(new Error("Upstream Gemini internal model core dump 0xDEADBEEF"));
    const res = createMockRes();

    await polishHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: { recipe: { title: "Draft Soup" } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls.at(-1)[0];
    expect(body.error).toBe("Failed to polish recipe with Gemini AI. Please try again.");
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe("string");
    expect(body.details).toBeUndefined();
    expect(body.prompt).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("0xDEADBEEF");
  });

  it("sanitizes parse error responses and includes requestId without leaking details", async () => {
    generateContent.mockRejectedValueOnce(new Error("Sensitive database connection timeout in worker"));
    const res = createMockRes();

    await parseHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: { mode: "text", text: "Some soup recipe" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls.at(-1)[0];
    expect(body.error).toBe("Failed to analyze recipe with Gemini AI. Please try again.");
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe("string");
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Sensitive database connection timeout");
  });

  it("sanitizes cover error responses when Cloudflare returns an upstream error", async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ errors: [{ code: 1000, message: "Internal Cloudflare Worker Panic" }] }),
    });
    const res = createMockRes();

    await coverHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: { recipe: { title: "Apple Pie" } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls.at(-1)[0];
    expect(body.error).toBe("Cover generation failed. Please try again.");
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe("string");
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Internal Cloudflare Worker Panic");
  });

  it("sanitizes missing credentials errors without leaking environment variable names", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    const res = createMockRes();

    await coverHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: { recipe: { title: "Apple Pie" } },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    const body = res.json.mock.calls.at(-1)[0];
    expect(body.error).toBe("AI image generation service is currently unavailable.");
    expect(body.requestId).toBeDefined();
    expect(body.missingKey).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("CLOUDFLARE_API_TOKEN");
  });

  it("rejects oversized request payload on polish-recipe with HTTP 413", async () => {
    const res = createMockRes();
    const largeRecipe = {
      title: "Huge Recipe",
      description: "x".repeat(105 * 1024),
    };

    await polishHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: { recipe: largeRecipe },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(413);
    const body = res.json.mock.calls.at(-1)[0];
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects oversized request payload on generate-cover with HTTP 413", async () => {
    const res = createMockRes();
    const largeRecipe = {
      title: "Huge Cover",
      description: "x".repeat(105 * 1024),
    };

    await coverHandler(
      {
        method: "POST",
        headers: { authorization: "Bearer test-valid-token" },
        body: { recipe: largeRecipe },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(413);
    const body = res.json.mock.calls.at(-1)[0];
    expect(body.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("/api/ai/shared-cover endpoint", () => {
  it("rejects unsupported methods with HTTP 405", async () => {
    const { default: sharedCoverHandler } = await import("./shared-cover.js");
    const res = createMockRes();

    await sharedCoverHandler(
      {
        method: "DELETE",
        headers: {},
        query: { token: "valid-share-token-12345" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith("Allow", "POST, GET");
  });

  it("rejects invalid or missing token with HTTP 400", async () => {
    const { default: sharedCoverHandler } = await import("./shared-cover.js");
    const res = createMockRes();

    await sharedCoverHandler(
      {
        method: "GET",
        headers: {},
        query: { token: "bad token with spaces" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls.at(-1)[0];
    expect(body.code).toBe("INVALID_SHARE_TOKEN");
  });
});
