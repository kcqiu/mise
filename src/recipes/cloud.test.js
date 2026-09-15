import { describe, it, expect, vi, afterEach } from "vitest";
import * as cloud from "./cloud";

describe("Groceries Cloud Synchronization Client", () => {
  afterEach(() => {
    cloud.setSupabaseClientForTesting(null);
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
        config: { broadcast: { self: false } },
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
      expect(mockSend).toHaveBeenCalledWith({
        type: "broadcast",
        event: "grocery_mutations",
        payload: { ping: "pong" },
      });
    });
  });
});
