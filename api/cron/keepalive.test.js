import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./keepalive.js";

function createMockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  };
}

describe("Vercel Cron Keepalive Endpoint (/api/cron/keepalive)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("VITE_SUPABASE_URL", "https://test-project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects non-GET/HEAD methods with 405", async () => {
    const res = createMockRes();
    await handler({ method: "POST", headers: {} }, res);

    expect(res.setHeader).toHaveBeenCalledWith("Allow", "GET, HEAD");
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: "Method not allowed. Use GET or HEAD.",
      }),
    );
  });

  it("rejects request if CRON_SECRET is set but authorization header is missing", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret-cron-token");
    const res = createMockRes();

    await handler({ method: "GET", headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: "Unauthorized" }),
    );
  });

  it("rejects request if CRON_SECRET is set but authorization header does not match", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret-cron-token");
    const res = createMockRes();

    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer wrong-token" },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: "Unauthorized" }),
    );
  });

  it("allows request when CRON_SECRET matches bearer authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "super-secret-cron-token");
    const res = createMockRes();

    const mockLimit = vi.fn().mockResolvedValue({
      data: [{ id: "system-recipe-1" }],
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    const mockClient = { from: mockFrom };

    await handler(
      {
        method: "GET",
        headers: { authorization: "Bearer super-secret-cron-token" },
      },
      res,
      { client: mockClient },
    );

    expect(mockFrom).toHaveBeenCalledWith("recipes");
    expect(mockSelect).toHaveBeenCalledWith("id");
    expect(mockEq).toHaveBeenCalledWith("is_system", true);
    expect(mockLimit).toHaveBeenCalledWith(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        matchedRecords: 1,
      }),
    );
  });

  it("allows unauthenticated request when CRON_SECRET is not configured", async () => {
    const res = createMockRes();

    const mockLimit = vi.fn().mockResolvedValue({
      data: [{ id: "system-recipe-1" }],
      error: null,
    });
    const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    const mockClient = { from: mockFrom };

    await handler(
      { method: "GET", headers: {} },
      res,
      { client: mockClient },
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        matchedRecords: 1,
      }),
    );
  });

  it("returns 500 when Supabase configuration is missing", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_KEY", "");

    const res = createMockRes();
    await handler({ method: "GET", headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: "Supabase configuration missing.",
      }),
    );
  });

  it("returns 500 if Supabase query encounters a database error", async () => {
    const res = createMockRes();

    const mockLimit = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Database connection failed" },
    });
    const mockEq = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    const mockClient = { from: mockFrom };

    await handler(
      { method: "GET", headers: {} },
      res,
      { client: mockClient },
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: "Database query failed",
        details: "Database connection failed",
      }),
    );
  });

  it("returns 500 if an unexpected exception occurs during processing", async () => {
    const res = createMockRes();

    const mockFrom = vi.fn().mockImplementation(() => {
      throw new Error("Fatal runtime error");
    });

    const mockClient = { from: mockFrom };

    await handler(
      { method: "GET", headers: {} },
      res,
      { client: mockClient },
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: "Unexpected error during keepalive ping",
      }),
    );
  });
});
