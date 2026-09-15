import { describe, it, expect } from "vitest";
import {
  parseIngredientDetails,
  getCanonicalItemKey,
  categorizeAisle,
  isNonShoppingUtility,
  isPantryStaple,
  selectGroceryList,
  reconcileGrocerySessions,
  createGrocerySession,
  resetGrocerySession,
  rolloverGrocerySession,
  EMPTY_GROCERY_SESSION,
  generateUUID,
  getDeviceId,
  dbRecordToGrocerySession,
  readGroceryQueue,
  saveGroceryQueue,
  enqueueGroceryMutation,
  ackGroceryMutations,
  clearGroceryQueue,
  applyMutationToSession,
  rebaseMutationsOverSession,
  mergeGuestIntoAccountSession,
  formatGroceryListText,
  DEFAULT_AISLE_ORDER,
  PRESET_AISLE_PROFILES,
  reorderAisles,
} from "./groceries";

describe("Groceries Domain Engine: Invariant & Normalization Tests", () => {
  // 1. onion singular/plural normalization
  it("normalizes singular and plural onion to identical lemma and key", () => {
    const sing = parseIngredientDetails("onion");
    const plur = parseIngredientDetails("onions");
    expect(sing.lemma).toBe("onion");
    expect(plur.lemma).toBe("onion");
    expect(getCanonicalItemKey(sing)).toBe("food:onion");
    expect(getCanonicalItemKey(plur)).toBe("food:onion");
  });

  // 2. yellow onion vs red onion
  it("keeps yellow onion and red onion as distinct culinary keys", () => {
    const yellow = parseIngredientDetails("yellow onion");
    const red = parseIngredientDetails("red onion");
    expect(yellow.modifiers).toContain("yellow");
    expect(red.modifiers).toContain("red");
    expect(getCanonicalItemKey(yellow)).toBe("food:onion:yellow");
    expect(getCanonicalItemKey(red)).toBe("food:onion:red");
    expect(getCanonicalItemKey(yellow)).not.toBe(getCanonicalItemKey(red));
  });

  // 3. milk vs whole milk (non-inferential normalization)
  it("preserves unspecified milk as food:milk and never infers food:milk:whole", () => {
    const plainMilk = parseIngredientDetails("milk");
    const wholeMilk = parseIngredientDetails("whole milk");
    const oatMilk = parseIngredientDetails("oat milk");
    const twoPercent = parseIngredientDetails("2% milk");

    expect(getCanonicalItemKey(plainMilk)).toBe("food:milk");
    expect(plainMilk.displayName).toBe("Milk"); // Must remain "Milk", NEVER "Whole Milk"
    expect(getCanonicalItemKey(wholeMilk)).toBe("food:milk:whole");
    expect(wholeMilk.displayName).toBe("Whole Milk");
    expect(getCanonicalItemKey(oatMilk)).toBe("food:milk:oat");
    expect(oatMilk.displayName).toBe("Oat Milk");
    expect(getCanonicalItemKey(twoPercent)).toBe("food:milk:2-percent");

    expect(getCanonicalItemKey(plainMilk)).not.toBe(getCanonicalItemKey(wholeMilk));
  });

  // 3b. Regression: all non-inferential display labels and keys
  it("never silently infers missing culinary information in display labels or canonical keys", () => {
    const pairs = [
      { raw: "milk", expectedKey: "food:milk", expectedName: "Milk", variant: "whole milk", variantKey: "food:milk:whole", variantName: "Whole Milk" },
      { raw: "onion", expectedKey: "food:onion", expectedName: "Onion", variant: "yellow onion", variantKey: "food:onion:yellow", variantName: "Yellow Onion" },
      { raw: "chicken", expectedKey: "food:chicken", expectedName: "Chicken", variant: "chicken breast", variantKey: "food:chicken:breast", variantName: "Chicken Breast" },
      { raw: "butter", expectedKey: "food:butter", expectedName: "Butter", variant: "unsalted butter", variantKey: "food:butter:unsalted", variantName: "Unsalted Butter" },
      { raw: "oil", expectedKey: "food:oil", expectedName: "Oil", variant: "olive oil", variantKey: "food:olive-oil", variantName: "Olive Oil" },
    ];

    pairs.forEach(({ raw, expectedKey, expectedName, variant, variantKey, variantName }) => {
      const parsedRaw = parseIngredientDetails(raw);
      expect(getCanonicalItemKey(parsedRaw)).toBe(expectedKey);
      expect(parsedRaw.displayName).toBe(expectedName);

      const parsedVariant = parseIngredientDetails(variant);
      expect(getCanonicalItemKey(parsedVariant)).toBe(variantKey);
      expect(parsedVariant.displayName).toBe(variantName);

      expect(getCanonicalItemKey(parsedRaw)).not.toBe(getCanonicalItemKey(parsedVariant));
    });
  });

  // 4. salted vs unsalted butter
  it("preserves culinary distinction between salted and unsalted butter", () => {
    const salted = parseIngredientDetails("salted butter");
    const unsalted = parseIngredientDetails("unsalted butter");
    expect(getCanonicalItemKey(salted)).toBe("food:butter:salted");
    expect(getCanonicalItemKey(unsalted)).toBe("food:butter:unsalted");
    expect(salted.displayName).toBe("Salted Butter");
    expect(unsalted.displayName).toBe("Unsalted Butter");
    expect(getCanonicalItemKey(salted)).not.toBe(getCanonicalItemKey(unsalted));
  });

  // 5. chicken breast vs chicken thigh
  it("keeps chicken breast and chicken thigh strictly distinct with postfixed cuts", () => {
    const breast = parseIngredientDetails("chicken breast");
    const thigh = parseIngredientDetails("chicken thighs");
    expect(getCanonicalItemKey(breast)).toBe("food:chicken:breast");
    expect(getCanonicalItemKey(thigh)).toBe("food:chicken:thigh");
    expect(breast.displayName).toBe("Chicken Breast");
    expect(thigh.displayName).toBe("Chicken Thigh");
  });

  // 6. green onion / scallion safe synonym normalization
  it("safely normalizes green onion, spring onion, and scallions to food:scallion", () => {
    const gOnion = parseIngredientDetails("green onions");
    const sOnion = parseIngredientDetails("spring onion");
    const scallion = parseIngredientDetails("scallions");

    expect(getCanonicalItemKey(gOnion)).toBe("food:scallion");
    expect(getCanonicalItemKey(sOnion)).toBe("food:scallion");
    expect(getCanonicalItemKey(scallion)).toBe("food:scallion");
  });

  // 7. garlic head + garlic cloves identity grouping
  it("groups 1 head garlic and 3 cloves garlic under food:garlic with discrete requirements", () => {
    const recipes = [
      {
        id: "roast-chicken",
        title: "Roast Chicken",
        servings: 4,
        ingredients: [{ name: "garlic", quantity: 1, unit: "head", note: "" }],
      },
      {
        id: "garlic-butter",
        title: "Garlic Butter",
        servings: 2,
        ingredients: [{ name: "garlic cloves", quantity: 3, unit: "cloves", note: "" }],
      },
    ];

    const session = createGrocerySession({
      recipes: [
        { recipeId: "roast-chicken", servings: 4, addedAt: 100 },
        { recipeId: "garlic-butter", servings: 2, addedAt: 200 },
      ],
    });

    const derived = selectGroceryList(session, recipes);
    const produceAisle = derived.aisles.find((a) => a.category === "Produce");
    expect(produceAisle).toBeDefined();

    const garlicItem = produceAisle.items.find((i) => i.key === "food:garlic");
    expect(garlicItem).toBeDefined();
    expect(garlicItem.name).toBe("Garlic");
    // Identity is unified, but quantities cannot be safely mathematically combined
    expect(garlicItem.isCompatibleQuantity).toBe(false);
    expect(garlicItem.quantity).toBeNull();
    expect(garlicItem.requirements).toHaveLength(2);
    expect(garlicItem.requirements.some((r) => r.quantityText.includes("1 head") && r.recipeTitle.includes("Roast Chicken"))).toBe(true);
    expect(garlicItem.requirements.some((r) => r.quantityText.includes("3 cloves") && r.recipeTitle.includes("Garlic Butter"))).toBe(true);
  });

  // 8. compatible milk volume aggregation
  it("aggregates compatible volume units (1 cup milk + 240 ml milk -> 2 cups Milk)", () => {
    const recipes = [
      {
        id: "cereal",
        title: "Cereal",
        servings: 1,
        ingredients: [{ name: "milk", quantity: 1, unit: "cup", note: "" }], // 240 ml
      },
      {
        id: "tea",
        title: "Milk Tea",
        servings: 1,
        ingredients: [{ name: "milk", quantity: 240, unit: "ml", note: "" }], // 240 ml
      },
    ];

    const session = createGrocerySession({
      recipes: [
        { recipeId: "cereal", servings: 1, addedAt: 100 },
        { recipeId: "tea", servings: 1, addedAt: 200 },
      ],
    });

    const derived = selectGroceryList(session, recipes);
    const dairyAisle = derived.aisles.find((a) => a.category === "Dairy & Refrigerated");
    const milk = dairyAisle.items.find((i) => i.key === "food:milk");

    expect(milk).toBeDefined();
    expect(milk.name).toBe("Milk"); // Must remain "Milk", NEVER "Whole Milk"
    expect(milk.isCompatibleQuantity).toBe(true);
    expect(milk.quantity).toBe(2);
    expect(milk.unit).toBe("cups");
    expect(milk.quantityText).toBe("2 cups");
  });

  // 9. incompatible bunch + grams grouping
  it("groups incompatible bunch and grams under single product with discrete requirements", () => {
    const recipes = [
      {
        id: "salad",
        title: "Kale Salad",
        servings: 2,
        ingredients: [{ name: "kale", quantity: 1, unit: "bunch", note: "" }],
      },
      {
        id: "smoothie",
        title: "Green Smoothie",
        servings: 1,
        ingredients: [{ name: "kale", quantity: 200, unit: "g", note: "" }],
      },
    ];

    const session = createGrocerySession({
      recipes: [
        { recipeId: "salad", servings: 2, addedAt: 100 },
        { recipeId: "smoothie", servings: 1, addedAt: 200 },
      ],
    });

    const derived = selectGroceryList(session, recipes);
    const produceAisle = derived.aisles.find((a) => a.category === "Produce");
    const kale = produceAisle.items.find((i) => i.key === "food:kale");

    expect(kale).toBeDefined();
    expect(kale.isCompatibleQuantity).toBe(false);
    expect(kale.requirements).toHaveLength(2);
    expect(kale.requirements.some((r) => r.quantityText.includes("1 bunch"))).toBe(true);
    expect(kale.requirements.some((r) => r.quantityText.includes("200 g"))).toBe(true);
  });

  // 10. preparation notes not affecting identity
  it("strips preparation notes from identity key while preserving them in attribution", () => {
    const diced = parseIngredientDetails("yellow onions (finely diced)");
    const sliced = parseIngredientDetails("yellow onion, thinly sliced");

    expect(getCanonicalItemKey(diced)).toBe("food:onion:yellow");
    expect(getCanonicalItemKey(sliced)).toBe("food:onion:yellow");
    expect(diced.note).toBe("finely diced");
    expect(sliced.note).toBe("thinly sliced");
  });

  // 11. water/ice exclusion
  it("completely suppresses water and ice from grocery items", () => {
    expect(isNonShoppingUtility("water")).toBe(true);
    expect(isNonShoppingUtility("tap water")).toBe(true);
    expect(isNonShoppingUtility("cold water")).toBe(true);
    expect(isNonShoppingUtility("boiling water")).toBe(true);
    expect(isNonShoppingUtility("ice cubes")).toBe(true);
    expect(isNonShoppingUtility("crushed ice")).toBe(true);
    expect(isNonShoppingUtility("sparkling water")).toBe(false);
  });

  // 12. pantry staple classification
  it("identifies common pantry staples like salt, black pepper, and olive oil", () => {
    expect(isPantryStaple("kosher salt")).toBe(true);
    expect(isPantryStaple("black pepper")).toBe(true);
    expect(isPantryStaple("extra virgin olive oil")).toBe(true);
    expect(isPantryStaple("vegetable oil")).toBe(true);
    expect(isPantryStaple("chicken breast")).toBe(false);
  });

  // 13. serving rescaling
  it("scales ingredient quantities dynamically with serving size", () => {
    const recipes = [
      {
        id: "pasta",
        title: "Pasta",
        servings: 2,
        ingredients: [{ name: "yellow onion", quantity: 1, unit: "", note: "" }],
      },
    ];

    // Scale from 2 to 6 servings (3x)
    const session = createGrocerySession({
      recipes: [{ recipeId: "pasta", servings: 6, addedAt: 100 }],
    });

    const derived = selectGroceryList(session, recipes);
    const onion = derived.aisles[0].items.find((i) => i.key === "food:onion:yellow");
    expect(onion.quantity).toBe(3);
  });

  // 14. checked item remaining checked after rescaling
  it("keeps an item checked even after its serving size or quantity changes", () => {
    const recipes = [
      {
        id: "pasta",
        title: "Pasta",
        servings: 2,
        ingredients: [{ name: "yellow onion", quantity: 1, unit: "", note: "" }],
      },
    ];

    const session = createGrocerySession({
      recipes: [{ recipeId: "pasta", servings: 2, addedAt: 100 }],
      itemOverrides: {
        "food:onion:yellow": {
          status: "checked",
          updatedAt: 100,
        },
      },
    });

    // Verify checked at 2 servings
    let derived = selectGroceryList(session, recipes);
    expect(derived.aisles[0].items[0].status).toBe("checked");
    expect(derived.aisles[0].items[0].quantity).toBe(1);

    // Scale to 4 servings
    session.recipes[0].servings = 4;
    derived = selectGroceryList(session, recipes);

    // Invariant: Quantity updates to 2, but status REMAINS checked!
    expect(derived.aisles[0].items[0].quantity).toBe(2);
    expect(derived.aisles[0].items[0].status).toBe("checked");
  });

  // 15. dismissed item suppression
  it("suppresses dismissed items from the derived view via tombstone", () => {
    const recipes = [
      {
        id: "pasta",
        title: "Pasta",
        servings: 2,
        ingredients: [{ name: "yellow onion", quantity: 1, unit: "", note: "" }],
      },
    ];

    const session = createGrocerySession({
      recipes: [{ recipeId: "pasta", servings: 2, addedAt: 100 }],
      itemOverrides: {
        "food:onion:yellow": {
          status: "dismissed",
          updatedAt: 200,
        },
      },
    });

    const derived = selectGroceryList(session, recipes);
    const onion = derived.aisles.flatMap((a) => a.items).find((i) => i.key === "food:onion:yellow");
    expect(onion).toBeUndefined();
  });

  // 16. recipe removal / re-add within the same session
  it("restores checked state when a recipe is removed and re-added in the same session", () => {
    const recipes = [
      {
        id: "fajitas",
        title: "Fajitas",
        servings: 2,
        ingredients: [{ name: "yellow onion", quantity: 1, unit: "", note: "" }],
      },
    ];

    const session = createGrocerySession({
      recipes: [{ recipeId: "fajitas", servings: 2, addedAt: 100 }],
      itemOverrides: {
        "food:onion:yellow": {
          status: "checked",
          updatedAt: 150,
        },
      },
    });

    // 1. Active: onion is checked
    let derived = selectGroceryList(session, recipes);
    expect(derived.aisles[0].items[0].status).toBe("checked");

    // 2. Remove recipe: list is empty
    session.recipes = [];
    derived = selectGroceryList(session, recipes);
    expect(derived.totalCount).toBe(0);

    // 3. Re-add recipe within the SAME session: checked state returns!
    session.recipes = [{ recipeId: "fajitas", servings: 2, addedAt: 200 }];
    derived = selectGroceryList(session, recipes);
    expect(derived.aisles[0].items[0].status).toBe("checked");

    // 4. Reset to a NEW session and re-add recipe: checked state does NOT return!
    const newSession = resetGrocerySession();
    newSession.recipes = [{ recipeId: "fajitas", servings: 2, addedAt: 300 }];
    const derivedNew = selectGroceryList(newSession, recipes);
    expect(derivedNew.aisles[0].items[0].status).toBe("unchecked");
  });

  // 17. session isolation: Trip A overrides never leak into Trip B
  it("strictly isolates sessions: overrides from Trip A never leak into Trip B", () => {
    const recipes = [
      {
        id: "cereal",
        title: "Cereal",
        servings: 1,
        ingredients: [{ name: "milk", quantity: 1, unit: "cup", note: "" }],
      },
      {
        id: "latte",
        title: "Latte",
        servings: 1,
        ingredients: [{ name: "milk", quantity: 1, unit: "cup", note: "" }],
      },
    ];

    // Trip A: Add cereal containing milk, check milk
    let tripA = createGrocerySession({
      recipes: [{ recipeId: "cereal", servings: 1, addedAt: 100 }],
      itemOverrides: {
        "food:milk": {
          status: "checked",
          updatedAt: 150,
        },
      },
    });

    let derivedA = selectGroceryList(tripA, recipes);
    const milkA = derivedA.aisles.find((a) => a.category === "Dairy & Refrigerated").items.find((i) => i.key === "food:milk");
    expect(milkA.status).toBe("checked");

    // Complete / reset trip -> Trip B
    const tripB = resetGrocerySession();
    expect(tripB.id).not.toBe(tripA.id);
    expect(Object.keys(tripB.itemOverrides)).toHaveLength(0);

    // Trip B: Add latte containing milk
    tripB.recipes = [{ recipeId: "latte", servings: 1, addedAt: 200 }];

    // Milk MUST start unchecked in Trip B; no checked/dismissed/promoted override survives
    const derivedB = selectGroceryList(tripB, recipes);
    const milkB = derivedB.aisles.find((a) => a.category === "Dairy & Refrigerated").items.find((i) => i.key === "food:milk");
    expect(milkB.status).toBe("unchecked");
    expect(derivedB.checkedCount).toBe(0);
  });

  // 18. custom item UUID identity
  it("maintains custom item independent identity via UUID without merging into recipe items", () => {
    const recipes = [
      {
        id: "soup",
        title: "Soup",
        servings: 2,
        ingredients: [{ name: "yellow onion", quantity: 1, unit: "", note: "" }],
      },
    ];

    const session = createGrocerySession({
      recipes: [{ recipeId: "soup", servings: 2, addedAt: 100 }],
      customItems: [
        {
          id: "custom-onion-uuid-123",
          name: "yellow onion",
          quantity: 2,
          unit: "",
          category: "Produce",
          note: "Extra for snacking",
          status: "unchecked",
          updatedAt: 100,
        },
      ],
    });

    const derived = selectGroceryList(session, recipes);
    const produce = derived.aisles.find((a) => a.category === "Produce");
    expect(produce.items).toHaveLength(2);

    const recipeOnion = produce.items.find((i) => !i.isCustom);
    const customOnion = produce.items.find((i) => i.isCustom);

    expect(recipeOnion.key).toBe("food:onion:yellow");
    expect(customOnion.key).toBe("custom:custom-onion-uuid-123");
    expect(customOnion.id).toBe("custom-onion-uuid-123");
  });

  // 19. custom item tombstone reconciliation
  it("prevents custom item resurrection via tombstone in multi-device reconciliation", () => {
    // Device A dismissed custom-eggs at T=200
    const deviceA = createGrocerySession({
      id: "shared-session-sync",
      customItems: [
        {
          id: "custom-eggs",
          name: "brown eggs",
          status: "dismissed",
          updatedAt: 200,
        },
      ],
    });

    // Stale Device B has custom-eggs active at T=100
    const deviceB = createGrocerySession({
      id: "shared-session-sync",
      customItems: [
        {
          id: "custom-eggs",
          name: "brown eggs",
          status: "unchecked",
          updatedAt: 100,
        },
      ],
    });

    // Reconcile A -> B
    const reconciledAB = reconcileGrocerySessions(deviceA, deviceB);
    const tombstoneAB = reconciledAB.customItems.find((i) => i.id === "custom-eggs");
    expect(tombstoneAB).toBeDefined();
    expect(tombstoneAB.status).toBe("dismissed");

    // Commutative check: Reconcile B -> A produces identical tombstone preservation
    const reconciledBA = reconcileGrocerySessions(deviceB, deviceA);
    const tombstoneBA = reconciledBA.customItems.find((i) => i.id === "custom-eggs");
    expect(tombstoneBA).toBeDefined();
    expect(tombstoneBA.status).toBe("dismissed");

    // When rendered in selectGroceryList, dismissed custom items are suppressed
    const derived = selectGroceryList(reconciledAB, []);
    expect(derived.totalCount).toBe(0);
  });

  // 20. rollover of unchecked recipe items into standalone custom items
  it("detaches unchecked recipe items and converts them to standalone custom items on rollover", () => {
    const recipes = [
      {
        id: "steak-dinner",
        title: "Steak Dinner",
        servings: 2,
        ingredients: [
          { name: "ribeye steak", quantity: 1, unit: "lb", note: "" },
          { name: "fresh rosemary", quantity: 2, unit: "sprigs", note: "" },
        ],
      },
    ];

    // Steak is purchased (checked), rosemary is unpurchased (unchecked)
    const trip1 = createGrocerySession({
      recipes: [{ recipeId: "steak-dinner", servings: 2, addedAt: 100 }],
      itemOverrides: {
        "food:steak:ribeye": {
          status: "checked",
          updatedAt: 150,
        },
      },
    });

    // Perform rollover
    const trip2 = rolloverGrocerySession(trip1, recipes);

    // Trip 2 invariants:
    // 1. Fresh session ID
    expect(trip2.id).not.toBe(trip1.id);
    // 2. Recipes are completely detached
    expect(trip2.recipes).toHaveLength(0);
    // 3. Overrides are completely fresh/clean
    expect(Object.keys(trip2.itemOverrides)).toHaveLength(0);
    // 4. Rosemary becomes standalone custom item
    expect(trip2.customItems).toHaveLength(1);
    expect(trip2.customItems[0].name).toContain("Rosemary");
    expect(trip2.customItems[0].note).toContain("Steak Dinner");
    expect(trip2.customItems[0].status).toBe("unchecked");

    // 5. Steak was purchased, so it is NOT rolled over
    expect(trip2.customItems.some((c) => c.name.toLowerCase().includes("steak"))).toBe(false);

    // 6. When rendered in selectGroceryList, old recipe does NOT regenerate other ingredients
    const derived2 = selectGroceryList(trip2, recipes);
    expect(derived2.totalCount).toBe(1);
    expect(derived2.activeRecipes).toHaveLength(0);
    expect(derived2.aisles[0].items[0].isCustom).toBe(true);
    expect(derived2.aisles[0].items[0].name).toContain("Rosemary");
  });

  // 21. LWW deterministic convergence under client timestamps
  it("converges deterministically under LWW reconciliation based on highest timestamp", () => {
    const sessionOlder = createGrocerySession({
      id: "shared-sync-1",
      updatedAt: 100,
      itemOverrides: {
        "food:milk": { status: "checked", updatedAt: 100 },
      },
    });

    const sessionNewer = createGrocerySession({
      id: "shared-sync-1",
      updatedAt: 200,
      itemOverrides: {
        "food:milk": { status: "unchecked", updatedAt: 200 },
      },
    });

    // Order of reconciliation arguments must converge to the newer timestamp
    const forward = reconcileGrocerySessions(sessionOlder, sessionNewer);
    const reverse = reconcileGrocerySessions(sessionNewer, sessionOlder);

    expect(forward.itemOverrides["food:milk"].status).toBe("unchecked");
    expect(reverse.itemOverrides["food:milk"].status).toBe("unchecked");
    expect(forward.itemOverrides["food:milk"].updatedAt).toBe(200);
    expect(reverse.itemOverrides["food:milk"].updatedAt).toBe(200);
  });
});

describe("Groceries Phase 2: Mutations, Sync, Guest Merge & Export Tests", () => {
  it("generates valid and unique RFC 4122 UUID v4 strings", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const id1 = generateUUID();
    const id2 = generateUUID();

    expect(id1).toMatch(uuidRegex);
    expect(id2).toMatch(uuidRegex);
    expect(id1).not.toBe(id2);
  });

  it("converts snake_case database records to camelCase client sessions", () => {
    const dbRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "active",
      started_at: "2026-09-14T10:00:00Z",
      updated_at: "2026-09-14T11:00:00Z",
      completed_at: null,
      revision: "5",
      recipes: [{ recipeId: "tacos", servings: 4 }],
      custom_items: [{ id: "custom-1", name: "Napkins", status: "unchecked" }],
      item_overrides: { "food:tortilla": { status: "checked" } },
    };

    const session = dbRecordToGrocerySession(dbRecord);
    expect(session.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(session.status).toBe("active");
    expect(session.revision).toBe(5);
    expect(session.startedAt).toBe(new Date("2026-09-14T10:00:00Z").getTime());
    expect(session.recipes).toHaveLength(1);
    expect(session.customItems).toHaveLength(1);
    expect(session.itemOverrides["food:tortilla"].status).toBe("checked");
    expect(dbRecordToGrocerySession(null)).toBeNull();
  });

  it("manages offline mutation queue: enqueue, ack, and clear", () => {
    const userId = "test-user-1";
    clearGroceryQueue(userId);
    expect(readGroceryQueue(userId)).toEqual([]);

    const mut1 = { mutationId: "mut-1", type: "RECIPE_ADDED" };
    const mut2 = { mutationId: "mut-2", type: "CUSTOM_ITEM_ADDED" };

    enqueueGroceryMutation(mut1, userId);
    enqueueGroceryMutation(mut2, userId);

    let queue = readGroceryQueue(userId);
    expect(queue).toHaveLength(2);
    expect(queue[0].mutationId).toBe("mut-1");

    ackGroceryMutations(["mut-1"], userId);
    queue = readGroceryQueue(userId);
    expect(queue).toHaveLength(1);
    expect(queue[0].mutationId).toBe("mut-2");

    clearGroceryQueue(userId);
    expect(readGroceryQueue(userId)).toEqual([]);
  });

  it("applies individual mutations predictably to grocery sessions", () => {
    let session = {
      ...EMPTY_GROCERY_SESSION,
      id: "session-mut-1",
      revision: 1,
    };

    // 1. RECIPE_ADDED
    session = applyMutationToSession(session, {
      type: "RECIPE_ADDED",
      targetId: "pasta",
      payload: { servings: 4 },
      clientTimestamp: 100,
    });
    expect(session.recipes).toHaveLength(1);
    expect(session.recipes[0].recipeId).toBe("pasta");
    expect(session.recipes[0].servings).toBe(4);

    // 2. RECIPE_SERVINGS_CHANGED
    session = applyMutationToSession(session, {
      type: "RECIPE_SERVINGS_CHANGED",
      targetId: "pasta",
      payload: { nextServings: 6 },
      clientTimestamp: 110,
    });
    expect(session.recipes[0].servings).toBe(6);

    // 3. ITEM_STATUS_CHANGED
    session = applyMutationToSession(session, {
      type: "ITEM_STATUS_CHANGED",
      targetId: "food:pasta",
      payload: { status: "checked" },
      clientTimestamp: 120,
    });
    expect(session.itemOverrides["food:pasta"].status).toBe("checked");

    // 4. PANTRY_ITEM_PROMOTED
    session = applyMutationToSession(session, {
      type: "PANTRY_ITEM_PROMOTED",
      targetId: "food:salt",
      payload: {},
      clientTimestamp: 130,
    });
    expect(session.itemOverrides["food:salt"].isPantryPromoted).toBe(true);
    expect(session.itemOverrides["food:salt"].status).toBe("unchecked");

    // 5. CUSTOM_ITEM_ADDED & EDITED & DELETED
    const customId = "c-123";
    session = applyMutationToSession(session, {
      type: "CUSTOM_ITEM_ADDED",
      targetId: customId,
      payload: { name: "Paper Towels", quantity: 2, unit: "pack" },
      clientTimestamp: 140,
    });
    expect(session.customItems).toHaveLength(1);
    expect(session.customItems[0].name).toBe("Paper Towels");

    session = applyMutationToSession(session, {
      type: "CUSTOM_ITEM_EDITED",
      targetId: customId,
      payload: { quantity: 3 },
      clientTimestamp: 150,
    });
    expect(session.customItems[0].quantity).toBe(3);

    session = applyMutationToSession(session, {
      type: "CUSTOM_ITEM_DELETED",
      targetId: customId,
      payload: {},
      clientTimestamp: 160,
    });
    expect(session.customItems[0].status).toBe("dismissed");

    // 6. RECIPE_REMOVED
    session = applyMutationToSession(session, {
      type: "RECIPE_REMOVED",
      targetId: "pasta",
      payload: {},
      clientTimestamp: 170,
    });
    expect(session.recipes).toHaveLength(0);
  });

  it("rebases pending local mutations over newer incoming server sessions", () => {
    const serverSession = {
      ...EMPTY_GROCERY_SESSION,
      id: "session-rebase",
      revision: 4,
      recipes: [{ recipeId: "curry", servings: 2, addedAt: 50 }],
      itemOverrides: {
        "food:curry-paste": { status: "checked", updatedAt: 200 },
      },
    };

    const pendingLocalMutations = [
      {
        mutationId: "mut-local-1",
        type: "RECIPE_SERVINGS_CHANGED",
        targetId: "curry",
        payload: { nextServings: 4 },
        clientTimestamp: 210,
      },
      {
        mutationId: "mut-local-2",
        type: "CUSTOM_ITEM_ADDED",
        targetId: "custom-lime",
        payload: { name: "Lime", quantity: 2, unit: "" },
        clientTimestamp: 220,
      },
    ];

    const rebased = rebaseMutationsOverSession(serverSession, pendingLocalMutations);

    expect(rebased.revision).toBe(4);
    expect(rebased.recipes[0].servings).toBe(4); // Local mutation replayed
    expect(rebased.itemOverrides["food:curry-paste"].status).toBe("checked"); // Server checked state preserved
    expect(rebased.customItems).toHaveLength(1);
    expect(rebased.customItems[0].name).toBe("Lime");
  });

  it("performs canonical guest merge correctly: max servings on recipe collision, LWW overrides, never merging derived text", () => {
    const guestSession = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [
        { recipeId: "soup", servings: 4, addedAt: 100 },
        { recipeId: "salad", servings: 2, addedAt: 100 },
      ],
      customItems: [
        { id: "cust-1", name: "Guest Item", updatedAt: 150, status: "unchecked" },
      ],
      itemOverrides: {
        "food:carrot": { status: "checked", updatedAt: 150 },
      },
    };

    const accountSession = {
      ...EMPTY_GROCERY_SESSION,
      recipes: [
        { recipeId: "soup", servings: 2, addedAt: 50 }, // Collision: guest 4 vs account 2 -> should become 4
        { recipeId: "bread", servings: 1, addedAt: 50 },
      ],
      customItems: [
        { id: "cust-1", name: "Older Item", updatedAt: 100, status: "unchecked" },
        { id: "cust-2", name: "Account Item", updatedAt: 100, status: "unchecked" },
      ],
      itemOverrides: {
        "food:carrot": { status: "unchecked", updatedAt: 100 }, // Guest 150 wins LWW
        "food:flour": { status: "checked", updatedAt: 100 },
      },
    };

    const merged = mergeGuestIntoAccountSession(guestSession, accountSession);

    // Recipes: soup (max 4), salad (2), bread (1)
    const soup = merged.recipes.find((r) => r.recipeId === "soup");
    expect(soup.servings).toBe(4);
    expect(merged.recipes.some((r) => r.recipeId === "salad")).toBe(true);
    expect(merged.recipes.some((r) => r.recipeId === "bread")).toBe(true);

    // Custom items: cust-1 has guest name "Guest Item" due to higher timestamp, cust-2 preserved
    const cust1 = merged.customItems.find((c) => c.id === "cust-1");
    expect(cust1.name).toBe("Guest Item");
    expect(merged.customItems.some((c) => c.id === "cust-2")).toBe(true);

    // Overrides: food:carrot is checked (guest was 150 > 100), flour preserved
    expect(merged.itemOverrides["food:carrot"].status).toBe("checked");
    expect(merged.itemOverrides["food:flour"].status).toBe("checked");
  });

  it("formats plain-text grocery list for export and SMS sharing", () => {
    const mockDerived = {
      activeRecipes: [{ recipeId: "tacos", title: "Street Tacos" }],
      aisles: [
        {
          category: "Produce",
          items: [
            {
              key: "food:lime",
              name: "Lime",
              quantityText: "2",
              isCompatibleQuantity: true,
              status: "unchecked",
            },
            {
              key: "food:cilantro",
              name: "Cilantro",
              quantityText: "1 bunch",
              isCompatibleQuantity: true,
              status: "checked",
            },
          ],
        },
      ],
      pantryStaples: [
        { key: "food:salt", name: "Kosher Salt" },
      ],
    };

    const text = formatGroceryListText(mockDerived);

    expect(text).toContain("🛒 MISE Grocery List (1 recipe)");
    expect(text).toContain("PRODUCE");
    expect(text).toContain("[ ] 2 Lime");
    expect(text).toContain("[x] 1 bunch Cilantro");
    expect(text).toContain("PANTRY STAPLES (Check at home)");
    expect(text).toContain("• Kosher Salt");
  });

  it("reorders supermarket aisles according to custom profiles", () => {
    const aisles = [
      { category: "Meat & Seafood", items: [] },
      { category: "Produce", items: [] },
      { category: "Dairy & Refrigerated", items: [] },
    ];

    const reordered = reorderAisles(aisles, PRESET_AISLE_PROFILES.produceFirst.order);

    expect(reordered[0].category).toBe("Produce");
    expect(reordered[1].category).toBe("Dairy & Refrigerated");
    expect(reordered[2].category).toBe("Meat & Seafood");
  });
});

