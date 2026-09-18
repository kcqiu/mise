import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  extractBearerToken,
  getClientIp,
  isRateLimitExempt,
  requireAiAuth,
  resetRateLimitsForTesting,
} from "./aiAuth.js";

describe("server/aiAuth.js - Token extraction and IP detection", () => {
  it("extracts bearer token case-insensitively", () => {
    expect(extractBearerToken({ headers: { authorization: "Bearer my-token-123" } })).toBe("my-token-123");
    expect(extractBearerToken({ headers: { Authorization: "bearer my-token-456" } })).toBe("my-token-456");
    expect(extractBearerToken({ headers: { authorization: "Basic dXNlcjpwYXNz" } })).toBeNull();
    expect(extractBearerToken({ headers: {} })).toBeNull();
  });

  it("extracts client IP from x-forwarded-for or fallbacks", () => {
    expect(getClientIp({ headers: { "x-forwarded-for": "203.0.113.195, 10.0.0.1" } })).toBe("203.0.113.195");
    expect(getClientIp({ headers: { "x-real-ip": "198.51.100.22" } })).toBe("198.51.100.22");
    expect(getClientIp({ socket: { remoteAddress: "192.0.2.1" } })).toBe("192.0.2.1");
    expect(getClientIp({})).toBe("127.0.0.1");
  });

  it("identifies wode0708@gmail.com as rate limit exempt", () => {
    expect(isRateLimitExempt({ email: "wode0708@gmail.com" })).toBe(true);
    expect(isRateLimitExempt({ email: "WODE0708@GMAIL.COM" })).toBe(true);
    expect(isRateLimitExempt({ email: "other@example.com" })).toBe(false);
    expect(isRateLimitExempt(null)).toBe(false);
  });
});

describe("server/aiAuth.js - Rate limiting", () => {
  beforeEach(() => {
    resetRateLimitsForTesting();
  });

  it("tracks requests in sliding window and enforces limit", () => {
    const key = "test:user1";
    const limit = 3;
    const windowMs = 60000;
    const t0 = 1000000;

    // 3 requests allowed
    expect(checkRateLimit(key, limit, windowMs, t0).allowed).toBe(true);
    expect(checkRateLimit(key, limit, windowMs, t0 + 1000).allowed).toBe(true);
    const third = checkRateLimit(key, limit, windowMs, t0 + 2000);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    // 4th request blocked
    const fourth = checkRateLimit(key, limit, windowMs, t0 + 3000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);

    // After window expires for first request, new request is allowed
    const afterWindow = checkRateLimit(key, limit, windowMs, t0 + windowMs + 500);
    expect(afterWindow.allowed).toBe(true);
  });
});

describe("server/aiAuth.js - requireAiAuth middleware", () => {
  beforeEach(() => {
    resetRateLimitsForTesting();
  });

  function createMockRes() {
    return {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
    };
  }

  it("rejects request without authorization header with 401", async () => {
    const res = createMockRes();
    const req = { headers: {} };
    const user = await requireAiAuth(req, res);

    expect(user).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "AUTH_REQUIRED" })
    );
  });

  it("rejects request with invalid token with 401", async () => {
    const res = createMockRes();
    const req = { headers: { authorization: "Bearer bad-token" } };
    const mockVerify = vi.fn().mockResolvedValue({ user: null, error: new Error("invalid token") });

    const user = await requireAiAuth(req, res, { verifyTokenFn: mockVerify });
    expect(user).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_TOKEN" })
    );
  });

  it("authenticates valid user and sets rate limit headers", async () => {
    const res = createMockRes();
    const req = { headers: { authorization: "Bearer valid-token" } };
    const validUser = { id: "user-123", email: "chef@example.com" };
    const mockVerify = vi.fn().mockResolvedValue({ user: validUser, error: null });

    const user = await requireAiAuth(req, res, {
      action: "parse",
      quota: 30,
      verifyTokenFn: mockVerify,
    });

    expect(user).toEqual(validUser);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "30");
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "29");
  });

  it("blocks user when hourly quota is exceeded with 429", async () => {
    const validUser = { id: "user-exhausted", email: "chef@example.com" };
    const mockVerify = vi.fn().mockResolvedValue({ user: validUser, error: null });

    // Use quota = 2
    for (let i = 0; i < 2; i++) {
      const res = createMockRes();
      const req = { headers: { authorization: "Bearer valid-token" } };
      const user = await requireAiAuth(req, res, {
        action: "polish",
        quota: 2,
        verifyTokenFn: mockVerify,
      });
      expect(user).not.toBeNull();
    }

    // 3rd request should be 429
    const blockedRes = createMockRes();
    const blockedReq = { headers: { authorization: "Bearer valid-token" } };
    const result = await requireAiAuth(blockedReq, blockedRes, {
      action: "polish",
      quota: 2,
      verifyTokenFn: mockVerify,
    });

    expect(result).toBeNull();
    expect(blockedRes.status).toHaveBeenCalledWith(429);
    expect(blockedRes.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(blockedRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "RATE_LIMIT_EXCEEDED" })
    );
  });

  it("applies dual IP throttling when dualIpThrottle is enabled", async () => {
    const mockVerify = vi.fn().mockImplementation((token) => {
      // Simulate different accounts on same IP
      return { user: { id: `user-${token}`, email: `${token}@example.com` }, error: null };
    });

    // Request 1 from user A on IP 203.0.113.5
    const res1 = createMockRes();
    const req1 = {
      headers: {
        authorization: "Bearer tokenA",
        "x-real-ip": "203.0.113.5",
      },
    };
    await requireAiAuth(req1, res1, {
      action: "cover",
      quota: 1,
      dualIpThrottle: true,
      verifyTokenFn: mockVerify,
    });

    // Request 2 from user B on the SAME IP 203.0.113.5
    const res2 = createMockRes();
    const req2 = {
      headers: {
        authorization: "Bearer tokenB",
        "x-real-ip": "203.0.113.5",
      },
    };
    const result2 = await requireAiAuth(req2, res2, {
      action: "cover",
      quota: 1,
      dualIpThrottle: true,
      verifyTokenFn: mockVerify,
    });

    expect(result2).toBeNull();
    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "RATE_LIMIT_EXCEEDED",
        error: expect.stringContaining("for your network"),
      })
    );
  });

  it("exempts wode0708@gmail.com from quota and dual IP rate limits", async () => {
    const exemptUser = { id: "owner-id-777", email: "wode0708@gmail.com" };
    const mockVerify = vi.fn().mockResolvedValue({ user: exemptUser, error: null });

    // Call 10 times with quota = 2
    for (let i = 0; i < 10; i++) {
      const res = createMockRes();
      const req = {
        headers: {
          authorization: "Bearer owner-token",
          "x-real-ip": "203.0.113.99",
        },
      };
      const user = await requireAiAuth(req, res, {
        action: "cover",
        quota: 2,
        dualIpThrottle: true,
        verifyTokenFn: mockVerify,
      });

      expect(user).toEqual(exemptUser);
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "unlimited");
      expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", "unlimited");
      expect(res.status).not.toHaveBeenCalledWith(429);
    }
  });
});
