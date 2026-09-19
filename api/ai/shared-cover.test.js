import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "./shared-cover.js";
import { resetRateLimitsForTesting } from "../../server/aiAuth.js";

const { mockServiceClient } = vi.hoisted(() => ({
  mockServiceClient: {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock("../../server/aiAuth.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getServiceRoleSupabaseClient: () => mockServiceClient,
  };
});

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    setHeader(name, val) {
      res.headers[name] = val;
    },
  };
  return res;
}

describe("/api/ai/shared-cover strict authorization invariant", () => {
  const validOwnerId = "11111111-1111-1111-1111-111111111111";
  const validRecipeId = "recipe-apple-pie-123";
  const validToken = "valid_share_token_1234567890";

  beforeEach(() => {
    resetRateLimitsForTesting();
    vi.clearAllMocks();
  });

  it("rejects non-GET methods with 405", async () => {
    const res = createMockRes();
    await handler({ method: "POST", headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toContain("Method not allowed");
  });

  it("rejects missing or malformed share token with 400", async () => {
    const res = createMockRes();
    await handler({ method: "GET", headers: {}, query: { token: "short" } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("INVALID_SHARE_TOKEN");
  });

  it("returns 404 if share token is not found or revoked", async () => {
    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
    });
    mockServiceClient.from = fromMock;

    const res = createMockRes();
    await handler({ method: "GET", headers: {}, query: { token: validToken } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("RECIPE_NOT_FOUND");
  });

  it("returns 404 if recipe has no private cover artwork", async () => {
    const shareRecord = {
      recipe_id: validRecipeId,
      created_by: validOwnerId,
      revoked_at: null,
      expires_at: null,
    };
    const recipeRecord = {
      id: validRecipeId,
      owner_id: validOwnerId,
      payload: {
        title: "Apple Pie",
        artwork: "apple-pie", // Preset atlas artwork, not /recipe-covers/
      },
    };

    mockServiceClient.from = vi.fn((table) => {
      if (table === "recipe_shares") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: shareRecord, error: null }),
            }),
          }),
        };
      }
      if (table === "recipes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: recipeRecord, error: null }),
            }),
          }),
        };
      }
    });

    const res = createMockRes();
    await handler({ method: "GET", headers: {}, query: { token: validToken } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe("NO_COVER");
  });

  it("rejects with 403 OWNER_MISMATCH if storage path folder does not equal recipe owner", async () => {
    const victimOwnerId = "22222222-2222-2222-2222-222222222222";
    const shareRecord = {
      recipe_id: validRecipeId,
      created_by: validOwnerId,
      revoked_at: null,
      expires_at: null,
    };
    const recipeRecord = {
      id: validRecipeId,
      owner_id: validOwnerId,
      payload: {
        title: "Apple Pie",
        // Attack: attempts to point to another user's folder!
        artwork: `https://supabase.co/storage/v1/object/public/recipe-covers/${victimOwnerId}/${validRecipeId}-123.webp`,
      },
    };

    mockServiceClient.from = vi.fn((table) => {
      if (table === "recipe_shares") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: shareRecord, error: null }),
            }),
          }),
        };
      }
      if (table === "recipes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: recipeRecord, error: null }),
            }),
          }),
        };
      }
    });

    const res = createMockRes();
    await handler({ method: "GET", headers: {}, query: { token: validToken } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("OWNER_MISMATCH");
  });

  it("rejects with 403 RECIPE_MISMATCH if storage path basename does not belong to recipe ID", async () => {
    const victimRecipeId = "secret-recipe-999";
    const shareRecord = {
      recipe_id: validRecipeId,
      created_by: validOwnerId,
      revoked_at: null,
      expires_at: null,
    };
    const recipeRecord = {
      id: validRecipeId,
      owner_id: validOwnerId,
      payload: {
        title: "Apple Pie",
        // Attack: same user, but points to a different recipe file!
        artwork: `https://supabase.co/storage/v1/object/public/recipe-covers/${validOwnerId}/${victimRecipeId}-123.webp`,
      },
    };

    mockServiceClient.from = vi.fn((table) => {
      if (table === "recipe_shares") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: shareRecord, error: null }),
            }),
          }),
        };
      }
      if (table === "recipes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: recipeRecord, error: null }),
            }),
          }),
        };
      }
    });

    const res = createMockRes();
    await handler({ method: "GET", headers: {}, query: { token: validToken } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("RECIPE_MISMATCH");
  });

  it("rejects path traversal or malformed path structure with 400", async () => {
    const shareRecord = {
      recipe_id: validRecipeId,
      created_by: validOwnerId,
      revoked_at: null,
      expires_at: null,
    };
    const recipeRecord = {
      id: validRecipeId,
      owner_id: validOwnerId,
      payload: {
        title: "Apple Pie",
        artwork: `https://supabase.co/storage/v1/object/public/recipe-covers/../other/${validRecipeId}.webp`,
      },
    };

    mockServiceClient.from = vi.fn((table) => {
      if (table === "recipe_shares") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: shareRecord, error: null }),
            }),
          }),
        };
      }
      if (table === "recipes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: recipeRecord, error: null }),
            }),
          }),
        };
      }
    });

    const res = createMockRes();
    await handler({ method: "GET", headers: {}, query: { token: validToken } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe("INVALID_PATH_STRUCTURE");
  });

  it("successfully verifies invariants and generates signed URL for valid share", async () => {
    const timestamp = 1710000000000;
    const shareRecord = {
      recipe_id: validRecipeId,
      created_by: validOwnerId,
      revoked_at: null,
      expires_at: null,
    };
    const recipeRecord = {
      id: validRecipeId,
      owner_id: validOwnerId,
      payload: {
        title: "Apple Pie",
        artwork: `https://supabase.co/storage/v1/object/public/recipe-covers/${validOwnerId}/${validRecipeId}-${timestamp}.webp?token=old`,
      },
    };

    const createSignedUrlMock = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://supabase.co/signed/valid-cover.webp" },
      error: null,
    });

    mockServiceClient.from = vi.fn((table) => {
      if (table === "recipe_shares") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: shareRecord, error: null }),
            }),
          }),
        };
      }
      if (table === "recipes") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: recipeRecord, error: null }),
            }),
          }),
        };
      }
    });

    mockServiceClient.storage.from = vi.fn().mockReturnValue({
      createSignedUrl: createSignedUrlMock,
    });

    const res = createMockRes();
    await handler({ method: "GET", headers: {}, query: { token: validToken } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.signedUrl).toBe("https://supabase.co/signed/valid-cover.webp");
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      `${validOwnerId}/${validRecipeId}-${timestamp}.webp`,
      1800,
    );
  });
});
