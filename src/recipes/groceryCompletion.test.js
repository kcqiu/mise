import { describe, expect, it, vi } from "vitest";
import { resolveGroceryCompletion } from "./groceryCompletion";
import { EMPTY_GROCERY_SESSION } from "./groceries";

const activeSession = {
  ...EMPTY_GROCERY_SESSION,
  id: "session-1",
  revision: 4,
  customItems: [
    {
      id: "custom-1",
      name: "Sparkling water",
      quantity: null,
      unit: "",
      category: "Beverages",
      note: "",
      status: "unchecked",
      updatedAt: 10,
    },
  ],
};

describe("resolveGroceryCompletion", () => {
  it("completes a guest trip locally", async () => {
    const result = await resolveGroceryCompletion({
      action: "clear",
      userId: null,
      isOnline: true,
      session: activeSession,
      recipes: [],
      newSessionId: "new-session",
      completeRemote: vi.fn(),
    });

    expect(result).toMatchObject({
      ok: true,
      message: "Grocery list cleared",
      clearQueue: false,
      broadcast: false,
      nextSession: {
        id: "new-session",
        recipes: [],
        customItems: [],
        itemOverrides: {},
      },
    });
  });

  it("passes rolled-over custom items to the cloud operation", async () => {
    const nextSession = { ...EMPTY_GROCERY_SESSION, id: "cloud-next" };
    const completeRemote = vi.fn().mockResolvedValue({
      success: true,
      activeSession: nextSession,
    });

    const result = await resolveGroceryCompletion({
      action: "rollover",
      userId: "user-1",
      isOnline: true,
      session: activeSession,
      recipes: [],
      newSessionId: "new-session",
      completeRemote,
    });

    expect(completeRemote).toHaveBeenCalledWith(
      "user-1",
      "session-1",
      "rollover",
      [expect.objectContaining({ name: "Sparkling Water", status: "unchecked" })],
      "new-session",
      4,
    );
    expect(result).toMatchObject({
      ok: true,
      message: "Completed trip; unpurchased items rolled over",
      clearQueue: true,
      broadcast: true,
      nextSession,
    });
  });

  it("returns the latest session and no success for a revision conflict", async () => {
    const latestSession = { ...activeSession, revision: 5 };
    const result = await resolveGroceryCompletion({
      action: "clear",
      userId: "user-1",
      isOnline: true,
      session: activeSession,
      recipes: [],
      newSessionId: "new-session",
      completeRemote: vi.fn().mockResolvedValue({
        success: false,
        code: "REVISION_CONFLICT",
        session: latestSession,
      }),
    });

    expect(result).toEqual({
      ok: false,
      error: "Could not complete trip: your list was updated on another device. Please review the latest list.",
      latestSession,
    });
  });

  it("does not create a local success when the cloud operation fails", async () => {
    const result = await resolveGroceryCompletion({
      action: "clear",
      userId: "user-1",
      isOnline: true,
      session: activeSession,
      recipes: [],
      newSessionId: "new-session",
      completeRemote: vi.fn().mockRejectedValue(new Error("network down")),
    });

    expect(result).toEqual({
      ok: false,
      error: "Could not complete trip. Your grocery list was not changed.",
    });
  });

  it("rejects signed-in completion while offline", async () => {
    const completeRemote = vi.fn();
    const result = await resolveGroceryCompletion({
      action: "clear",
      userId: "user-1",
      isOnline: false,
      session: activeSession,
      recipes: [],
      newSessionId: "new-session",
      completeRemote,
    });

    expect(result).toEqual({
      ok: false,
      error: "Internet connection required to complete trip",
    });
    expect(completeRemote).not.toHaveBeenCalled();
  });
});
