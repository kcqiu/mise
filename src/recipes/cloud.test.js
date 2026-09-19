import { describe, it, expect, vi, afterEach } from "vitest";
import * as cloud from "./cloud";

describe("Groceries Cloud Synchronization Client", () => {
  afterEach(() => {
    cloud.setSupabaseClientForTesting(null);
  });

  it("exchanges a Google ID token for a Supabase session", async () => {
    const signInWithIdToken = vi.fn().mockResolvedValue({
      data: { session: { access_token: "supabase-session-token" } },
      error: null,
    });
    cloud.setSupabaseClientForTesting({
      auth: { signInWithIdToken },
    });

    const result = await cloud.signInWithGoogle({
      idToken: "google-id-token",
      nonce: "raw-nonce",
    });

    expect(result.session.access_token).toBe("supabase-session-token");
    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "google-id-token",
      nonce: "raw-nonce",
    });
  });

  it("rejects an empty Google credential before contacting Supabase", async () => {
    const signInWithIdToken = vi.fn();
    cloud.setSupabaseClientForTesting({ auth: { signInWithIdToken } });

    await expect(cloud.signInWithGoogle({ idToken: "", nonce: "nonce" }))
      .rejects.toThrow("Google did not return a sign-in credential");
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  it("safely handles unauthenticated calls when cloud is disabled or credentials missing", async () => {
    const loadRes = await cloud.loadAccountGrocerySession(null);
    expect(loadRes.success).toBe(false);
    expect(loadRes.session).toBeNull();

    const saveRes = await cloud.saveAccountGroceryMutations(null, "s-1", 1, []);
    expect(saveRes.success).toBe(false);

    const compRes = await cloud.completeAccountGrocerySession(null, "s-1", "clear", [], "s-2", 1);
    expect(compRes.success).toBe(false);

    const unsub = cloud.subscribeGrocerySession(null, () => {});
    expect(typeof unsub).toBe("function");

    await expect(cloud.broadcastGroceryMutations(null, {})).resolves.toBeUndefined();
  });

  describe("RPC operations with injected client", () => {
    it("loads active grocery session and formats database record", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          session: {
            id: "22222222-2222-4222-8222-222222222222",
            status: "active",
            revision: 3,
            recipes: [{ recipeId: "curry", servings: 2 }],
            custom_items: [],
            item_overrides: {},
          },
        },
        error: null,
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.loadAccountGrocerySession("user-123");
      expect(mockRpc).toHaveBeenCalledWith("get_active_grocery_session");
      expect(res.success).toBe(true);
      expect(res.session.id).toBe("22222222-2222-4222-8222-222222222222");
      expect(res.session.revision).toBe(3);
    });

    it("handles load failure or database RPC errors gracefully", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: new Error("Network timeout"),
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.loadAccountGrocerySession("user-123");
      expect(res.success).toBe(false);
      expect(res.error.message).toBe("Network timeout");
    });

    it("applies queued mutations atomically via RPC", async () => {
      const mockMutations = [
        { mutationId: "m-1", type: "RECIPE_ADDED", targetId: "soup", payload: { servings: 4 } },
      ];

      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          sessionId: "22222222-2222-4222-8222-222222222222",
          revision: 4,
          ackMutationIds: ["m-1"],
          session: {
            id: "22222222-2222-4222-8222-222222222222",
            status: "active",
            revision: 4,
            recipes: [{ recipeId: "soup", servings: 4 }],
            custom_items: [],
            item_overrides: {},
          },
        },
        error: null,
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.saveAccountGroceryMutations("user-123", "22222222-2222-4222-8222-222222222222", 3, mockMutations);
      expect(mockRpc).toHaveBeenCalledWith("apply_grocery_mutations", {
        p_session_id: "22222222-2222-4222-8222-222222222222",
        p_expected_revision: 3,
        p_mutations: mockMutations,
      });
      expect(res.success).toBe(true);
      expect(res.revision).toBe(4);
      expect(res.ackMutationIds).toEqual(["m-1"]);
    });

    it("creates a missing cloud session and retries queued mutations", async () => {
      const sessionId = "22222222-2222-4222-8222-222222222222";
      const mutations = [
        {
          mutationId: "m-bootstrap",
          type: "RECIPE_ADDED",
          targetId: "soup",
          payload: { servings: 4 },
        },
      ];
      const activeSession = {
        id: sessionId,
        status: "active",
        revision: 1,
        recipes: [],
        custom_items: [],
        item_overrides: {},
      };
      const syncedSession = {
        ...activeSession,
        revision: 2,
        recipes: [{ recipeId: "soup", servings: 4 }],
      };
      const mockRpc = vi
        .fn()
        .mockResolvedValueOnce({
          data: { success: false, code: "SESSION_NOT_FOUND", sessionId },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { success: true, created: true, session: activeSession },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            sessionId,
            revision: 2,
            ackMutationIds: ["m-bootstrap"],
            session: syncedSession,
          },
          error: null,
        });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const result = await cloud.saveAccountGroceryMutations(
        "user-123",
        sessionId,
        1,
        mutations,
      );

      expect(result.success).toBe(true);
      expect(result.session.recipes).toEqual([
        { recipeId: "soup", servings: 4 },
      ]);
      expect(mockRpc).toHaveBeenNthCalledWith(2, "ensure_grocery_session", {
        p_session_id: sessionId,
      });
      expect(mockRpc).toHaveBeenNthCalledWith(3, "apply_grocery_mutations", {
        p_session_id: sessionId,
        p_expected_revision: 1,
        p_mutations: mutations,
      });
    });

    it("handles SESSION_COMPLETED response and parses currentActiveSession", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          code: "SESSION_COMPLETED",
          sessionId: "old-session",
          currentActiveSession: {
            id: "new-session",
            status: "active",
            revision: 1,
            recipes: [],
            custom_items: [],
            item_overrides: {},
          },
        },
        error: null,
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.saveAccountGroceryMutations("user-123", "old-session", 2, []);
      expect(res.success).toBe(false);
      expect(res.code).toBe("SESSION_COMPLETED");
      expect(res.currentActiveSession.id).toBe("new-session");
    });

    it("handles REVISION_CONFLICT when mutations are applied against stale revision", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          code: "REVISION_CONFLICT",
          sessionId: "session-stale-1",
          currentRevision: 5,
          session: {
            id: "session-stale-1",
            status: "active",
            revision: 5,
            recipes: [],
            custom_items: [],
            item_overrides: {},
          },
        },
        error: null,
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.saveAccountGroceryMutations("user-123", "session-stale-1", 3, []);
      expect(res.success).toBe(false);
      expect(res.code).toBe("REVISION_CONFLICT");
      expect(res.currentRevision).toBe(5);
      expect(res.session.id).toBe("session-stale-1");
      expect(res.session.revision).toBe(5);
      expect(res.currentSession.id).toBe("session-stale-1");
    });

    it("handles MUTATION_BATCH_TOO_LARGE when payload exceeds batch limit", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          code: "MUTATION_BATCH_TOO_LARGE",
          message: "Mutation batch exceeds maximum allowed limit of 100",
        },
        error: null,
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.saveAccountGroceryMutations("user-123", "session-1", 1, []);
      expect(res.success).toBe(false);
      expect(res.code).toBe("MUTATION_BATCH_TOO_LARGE");
    });

    it("completes session with action rollover and returns activeSession", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: true,
          action: "rollover",
          completedSessionId: "session-1",
          activeSession: {
            id: "session-2",
            status: "active",
            revision: 1,
            recipes: [],
            custom_items: [{ id: "c-1", name: "Rolled item" }],
            item_overrides: {},
          },
        },
        error: null,
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.completeAccountGrocerySession(
        "user-123",
        "session-1",
        "rollover",
        [{ id: "c-1", name: "Rolled item" }],
        "session-2",
        4,
      );

      expect(mockRpc).toHaveBeenCalledWith("complete_grocery_session", {
        p_session_id: "session-1",
        p_action: "rollover",
        p_rollover_custom_items: [{ id: "c-1", name: "Rolled item" }],
        p_new_session_id: "session-2",
        p_expected_revision: 4,
      });

      expect(res.success).toBe(true);
      expect(res.activeSession.id).toBe("session-2");
    });

    it("creates a missing cloud session and retries trip completion", async () => {
      const activeSession = {
        id: "session-1",
        status: "active",
        revision: 1,
        recipes: [],
        custom_items: [],
        item_overrides: {},
      };
      const clearedSession = {
        ...activeSession,
        id: "session-2",
      };
      const mockRpc = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            success: true,
            code: "ALREADY_COMPLETED",
            activeSession: null,
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { success: true, created: true, session: activeSession },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            action: "clear",
            completedSessionId: "session-1",
            activeSession: clearedSession,
          },
          error: null,
        });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const result = await cloud.completeAccountGrocerySession(
        "user-123",
        "session-1",
        "clear",
        [],
        "session-2",
        1,
      );

      expect(result.success).toBe(true);
      expect(result.activeSession.id).toBe("session-2");
      expect(mockRpc).toHaveBeenNthCalledWith(2, "ensure_grocery_session", {
        p_session_id: "session-1",
      });
      expect(mockRpc).toHaveBeenNthCalledWith(3, "complete_grocery_session", {
        p_session_id: "session-1",
        p_action: "clear",
        p_rollover_custom_items: [],
        p_new_session_id: "session-2",
        p_expected_revision: 1,
      });
    });

    it("handles REVISION_CONFLICT on trip completion guard", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          success: false,
          code: "REVISION_CONFLICT",
          currentRevision: 5,
          session: {
            id: "session-1",
            status: "active",
            revision: 5,
          },
        },
        error: null,
      });

      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const res = await cloud.completeAccountGrocerySession(
        "user-123",
        "session-1",
        "clear",
        [],
        "session-2",
        3, // Client thought revision was 3, but server is at 5
      );

      expect(res.success).toBe(false);
      expect(res.code).toBe("REVISION_CONFLICT");
      expect(res.currentRevision).toBe(5);
    });

    it("subscribes to and broadcasts on private realtime grocery session channels", async () => {
      const mockSend = vi.fn().mockResolvedValue(undefined);
      let broadcastHandler;

      const mockChannel = {
        on: vi.fn((type, filter, callback) => {
          broadcastHandler = callback;
          return mockChannel;
        }),
        subscribe: vi.fn(),
        send: mockSend,
      };

      const mockRemoveChannel = vi.fn();
      const mockClient = {
        channel: vi.fn(() => mockChannel),
        removeChannel: mockRemoveChannel,
      };

      cloud.setSupabaseClientForTesting(mockClient);

      // 1. Subscribe
      const onMessage = vi.fn();
      const unsubscribe = cloud.subscribeGrocerySession("session-realtime-1", onMessage);

      expect(mockClient.channel).toHaveBeenCalledWith("grocery:session-realtime-1", {
        config: { private: true, broadcast: { self: false } },
      });
      expect(mockChannel.subscribe).toHaveBeenCalled();

      // Trigger incoming broadcast message
      broadcastHandler({ payload: { revision: 4, ackMutationIds: ["m-10"] } });
      expect(onMessage).toHaveBeenCalledWith({ revision: 4, ackMutationIds: ["m-10"] });

      // Unsubscribe
      unsubscribe();
      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);

      // 2. Broadcast
      await cloud.broadcastGroceryMutations("session-realtime-1", { ping: "pong" });
      expect(mockClient.channel).toHaveBeenLastCalledWith("grocery:session-realtime-1", {
        config: { private: true, broadcast: { self: false } },
      });
      expect(mockSend).toHaveBeenCalledWith({
        type: "broadcast",
        event: "grocery_mutations",
        payload: { ping: "pong" },
      });
    });
  });

  describe("loadRecipeById", () => {
    it("returns null when no client is configured or recipeId is missing", async () => {
      cloud.setSupabaseClientForTesting(null);
      expect(await cloud.loadRecipeById(null)).toBeNull();
      expect(await cloud.loadRecipeById("")).toBeNull();
    });

    it("loads and returns recipe payload matching the ID", async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: "recipe-custom-123",
          payload: {
            title: "Custom Shared Pasta",
            description: "A wonderful pasta dish",
            ingredients: [],
            steps: [],
          },
        },
        error: null,
      });

      const mockClient = {
        from: vi.fn(() => ({
          select: mockSelect,
          eq: mockEq,
          maybeSingle: mockMaybeSingle,
        })),
      };

      cloud.setSupabaseClientForTesting(mockClient);

      const loaded = await cloud.loadRecipeById("recipe-custom-123");
      expect(mockClient.from).toHaveBeenCalledWith("recipes");
      expect(mockSelect).toHaveBeenCalledWith("id, payload");
      expect(mockEq).toHaveBeenCalledWith("id", "recipe-custom-123");
      expect(loaded).toEqual({
        id: "recipe-custom-123",
        title: "Custom Shared Pasta",
        description: "A wonderful pasta dish",
        ingredients: [],
        steps: [],
      });
    });

    it("returns null when database returns an error or no record", async () => {
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: new Error("Not found"),
          }),
        })),
      };

      cloud.setSupabaseClientForTesting(mockClient);
      const result = await cloud.loadRecipeById("non-existent");
      expect(result).toBeNull();
    });
  });

  describe("Capability recipe sharing RPCs", () => {
    it("getOrCreateRecipeShare returns share token via RPC", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true, share_token: "tok_test_123" },
        error: null,
      });
      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const token = await cloud.getOrCreateRecipeShare("recipe-1");
      expect(mockRpc).toHaveBeenCalledWith("get_or_create_recipe_share", {
        p_recipe_id: "recipe-1",
      });
      expect(token).toBe("tok_test_123");
    });

    it("loadRecipeByShareToken fetches recipe via get_shared_recipe RPC", async () => {
      const mockRecipe = {
        id: "recipe-1",
        title: "Shared Souffle",
        isShared: true,
      };
      const mockRpc = vi.fn().mockResolvedValue({
        data: mockRecipe,
        error: null,
      });
      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const recipe = await cloud.loadRecipeByShareToken("tok_test_123");
      expect(mockRpc).toHaveBeenCalledWith("get_shared_recipe", {
        p_token: "tok_test_123",
      });
      expect(recipe).toEqual(mockRecipe);
    });

    it("loadRecipeByShareToken auto-resolves private cover image via shared-cover API", async () => {
      const mockRecipe = {
        id: "recipe-1",
        title: "Shared Souffle",
        artwork: "https://supabase.co/storage/v1/object/public/recipe-covers/user-1/recipe-1-123.webp",
        isShared: true,
      };
      const mockRpc = vi.fn().mockResolvedValue({
        data: mockRecipe,
        error: null,
      });
      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ signedUrl: "https://supabase.co/storage/v1/object/sign/fresh-signed-cover.webp" }),
      });

      try {
        const recipe = await cloud.loadRecipeByShareToken("tok_test_123");
        expect(recipe.artwork).toBe("https://supabase.co/storage/v1/object/sign/fresh-signed-cover.webp");
        expect(globalThis.fetch).toHaveBeenCalledWith("/api/ai/shared-cover?token=tok_test_123");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("revokeRecipeShare calls revoke RPC", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });
      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const success = await cloud.revokeRecipeShare("recipe-1");
      expect(mockRpc).toHaveBeenCalledWith("revoke_recipe_share", {
        p_recipe_id: "recipe-1",
      });
      expect(success).toBe(true);
    });

    it("favoriteSharedRecipe calls favorite_shared_recipe RPC with token", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });
      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      const result = await cloud.favoriteSharedRecipe("tok_secret_abc");
      expect(mockRpc).toHaveBeenCalledWith("favorite_shared_recipe", {
        p_share_token: "tok_secret_abc",
      });
      expect(result).toEqual({ success: true });
    });

    it("setAccountFavorite delegates to favorite_shared_recipe RPC when shareToken is provided", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { success: true },
        error: null,
      });
      cloud.setSupabaseClientForTesting({ rpc: mockRpc });

      await cloud.setAccountFavorite("user-1", "recipe-shared-99", true, "tok_secret_abc");
      expect(mockRpc).toHaveBeenCalledWith("favorite_shared_recipe", {
        p_share_token: "tok_secret_abc",
      });
    });

    it("loadAccountLibrary does not leak database owner_id on shared recipes", async () => {
      const mockRecipesSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [{ id: "owned-1", payload: { title: "Owned Cake" } }],
              error: null,
            }),
          }),
        }),
      });

      const mockFavoritesSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ recipe_id: "owned-1" }, { recipe_id: "shared-author-recipe" }],
          error: null,
        }),
      });

      const mockProgressSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      const mockClient = {
        from: vi.fn((table) => {
          if (table === "recipes") {
            return {
              select: vi.fn((cols) => {
                if (cols.includes("payload")) {
                  return {
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({
                          data: [{ id: "owned-1", payload: { title: "Owned Cake" } }],
                          error: null,
                        }),
                      }),
                    }),
                    in: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: "shared-author-recipe",
                          payload: { title: "Alice's Secret Pie" },
                        },
                      ],
                      error: null,
                    }),
                  };
                }
                return mockRecipesSelect();
              }),
            };
          }
          if (table === "favorites") {
            return { select: mockFavoritesSelect };
          }
          if (table === "recipe_progress") {
            return { select: mockProgressSelect };
          }
          return {};
        }),
      };

      cloud.setSupabaseClientForTesting(mockClient);

      const library = await cloud.loadAccountLibrary("user-me");
      expect(library.sharedRecipes).toHaveLength(1);
      expect(library.sharedRecipes[0].title).toBe("Alice's Secret Pie");
      expect(library.sharedRecipes[0].isShared).toBe(true);
      expect(library.sharedRecipes[0].owner_id).toBeUndefined();
      expect(library.sharedRecipes[0].ownerId).toBeUndefined();
    });
  });

  describe("Recipe cover storage (Issue 7)", () => {
    it("uploads cover to private bucket and returns signed URL", async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "user-1/recipe-1-12345.webp" },
        error: null,
      });
      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: {
          signedUrl:
            "https://supabase.co/storage/v1/object/sign/recipe-covers/user-1/recipe-1-12345.webp?token=xyz",
        },
        error: null,
      });
      const mockGetPublicUrl = vi.fn();

      cloud.setSupabaseClientForTesting({
        storage: {
          from: vi.fn(() => ({
            upload: mockUpload,
            createSignedUrl: mockCreateSignedUrl,
            getPublicUrl: mockGetPublicUrl,
          })),
        },
      });

      const blob = new Blob(["fake-image-bytes"], { type: "image/webp" });
      const url = await cloud.uploadRecipeCover(blob, "recipe-1", "user-1");

      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^user-1\/recipe-1-\d+\.webp$/),
        blob,
        expect.objectContaining({ upsert: true, contentType: "image/webp" }),
      );
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        "user-1/recipe-1-12345.webp",
        31536000,
      );
      expect(url).toBe(
        "https://supabase.co/storage/v1/object/sign/recipe-covers/user-1/recipe-1-12345.webp?token=xyz",
      );
      expect(mockGetPublicUrl).not.toHaveBeenCalled();
    });

    it("falls back to getPublicUrl if createSignedUrl fails", async () => {
      const mockUpload = vi.fn().mockResolvedValue({
        data: { path: "user-1/recipe-1-12345.webp" },
        error: null,
      });
      const mockCreateSignedUrl = vi.fn().mockResolvedValue({
        data: null,
        error: new Error("Signed URL not supported"),
      });
      const mockGetPublicUrl = vi.fn().mockReturnValue({
        data: {
          publicUrl:
            "https://supabase.co/storage/v1/object/public/recipe-covers/user-1/recipe-1-12345.webp",
        },
      });

      cloud.setSupabaseClientForTesting({
        storage: {
          from: vi.fn(() => ({
            upload: mockUpload,
            createSignedUrl: mockCreateSignedUrl,
            getPublicUrl: mockGetPublicUrl,
          })),
        },
      });

      const blob = new Blob(["fake-image-bytes"], { type: "image/webp" });
      const url = await cloud.uploadRecipeCover(blob, "recipe-1", "user-1");

      expect(url).toBe(
        "https://supabase.co/storage/v1/object/public/recipe-covers/user-1/recipe-1-12345.webp",
      );
    });

    it("deleteRecipeCover extracts path cleanly and removes object even with signed query params", async () => {
      const mockRemove = vi.fn().mockResolvedValue({ data: [], error: null });
      cloud.setSupabaseClientForTesting({
        storage: {
          from: vi.fn(() => ({
            remove: mockRemove,
          })),
        },
      });

      await cloud.deleteRecipeCover(
        "https://supabase.co/storage/v1/object/sign/recipe-covers/user-1/recipe-1-12345.webp?token=sensitive-signature-query",
      );

      expect(mockRemove).toHaveBeenCalledWith(["user-1/recipe-1-12345.webp"]);
    });
  });
});

