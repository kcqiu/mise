import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import coverHandler from "./generate-cover.js";
import polishHandler from "./polish-recipe.js";
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
});
