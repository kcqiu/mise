# Grocery, Toast, Editor, and Empty-State Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one completion toast per grocery trip, a clearer grocery hierarchy, a centered responsive recipe editor, and concise actionable empty states.

**Architecture:** Keep completion orchestration in `RecipeApp` and presentation in `GroceryListView`. The child awaits a `{ ok }` result before closing its modal, while the parent alone mutates completion state and emits completion notifications. Styling remains local Tailwind utility composition with only the existing special-effects stylesheet used for native dialog behavior.

**Tech Stack:** React 19, Tailwind CSS 4, Vitest, Testing Library, Vite

**Spec:** `docs/superpowers/specs/2026-09-15-grocery-toast-editor-polish.md`

## Global Constraints

- Preserve routing, recipe and grocery data shapes, authentication, and synchronization schemas.
- Do not add a UI framework or new runtime dependency.
- Keep the current MISE colors, typography, restraint, and editorial tone.
- All production behavior changes require a failing regression test first.

---

### Task 1: Centralize grocery completion ownership

**Files:**
- Modify: `src/recipes/components/GroceryListView.test.jsx`
- Modify: `src/recipes/components/GroceryListView.jsx`
- Modify: `src/recipes/RecipeApp.test.jsx`
- Modify: `src/recipes/RecipeApp.jsx`

**Interfaces:**
- Consumes: `onCompleteTrip(action)` where `action` is `"clear"` or `"rollover"`.
- Produces: `Promise<{ ok: boolean }>`; only `{ ok: true }` closes the child confirmation modal.

- [ ] **Step 1: Write failing child ownership tests**

Add tests proving clear and rollover call `onCompleteTrip` once, do not call `onToast`, and keep the dialog open when the returned result is `{ ok: false }`.

- [ ] **Step 2: Run the focused tests and verify the ownership assertions fail**

Run: `npm test -- src/recipes/components/GroceryListView.test.jsx`

Expected: failures caused by the child still emitting completion toasts and closing before the async result.

- [ ] **Step 3: Implement the minimal child contract**

Make both handlers async, await `onCompleteTrip`, and close only when it returns success. Keep local fallback mutation behavior for isolated component usage, but do not emit a completion toast from the child.

- [ ] **Step 4: Add failing parent completion tests**

Exercise guest clear and rollover through `RecipeApp`; assert exactly one success notification for each operation. Add cloud-operation unit coverage around a small exported completion orchestrator if direct integration setup would require mocking the entire auth provider.

- [ ] **Step 5: Run the parent tests and verify the cloud failure assertion fails**

Run: `npm test -- src/recipes/RecipeApp.test.jsx`

Expected: failure because signed-in RPC failure currently falls through to a local success.

- [ ] **Step 6: Implement parent-only success and failure handling**

Return `{ ok: true }` only after local guest completion or confirmed cloud success. Return `{ ok: false }` for offline, revision conflict, unknown cloud response, or thrown error; preserve the current list and emit one existing-style error.

- [ ] **Step 7: Run focused completion tests**

Run: `npm test -- src/recipes/components/GroceryListView.test.jsx src/recipes/RecipeApp.test.jsx`

Expected: all focused tests pass.

### Task 2: Standardize toast placement and defensive deduplication

**Files:**
- Modify: `src/recipes/components/AuthModal.test.jsx`
- Modify: `src/recipes/components/ToastStack.jsx`
- Modify: `src/recipes/RecipeApp.test.jsx`
- Modify: `src/recipes/RecipeApp.jsx`

**Interfaces:**
- Consumes: `{ message, type, title, createdAt }` toast entries.
- Produces: mobile safe-area bottom-center placement and desktop bottom-right placement.

- [ ] **Step 1: Write failing duplicate and placement tests**

Add an app-level test that triggers two identical toast requests inside 1.2 seconds and observes one notification. Add a ToastStack behavior test that verifies the stack exposes the responsive placement hook and safe-area offset.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- src/recipes/components/AuthModal.test.jsx src/recipes/RecipeApp.test.jsx`

- [ ] **Step 3: Implement minimal deduplication and responsive placement**

Add `createdAt` when enqueuing; suppress an exact message/type/title match against the most recent toast when it is younger than 1.2 seconds. Center the base breakpoint stack using a safe-area-aware bottom value and restore right alignment at `sm`.

- [ ] **Step 4: Run focused toast tests**

Run: `npm test -- src/recipes/components/AuthModal.test.jsx src/recipes/RecipeApp.test.jsx`

Expected: all focused tests pass.

### Task 3: Clarify grocery hierarchy and empty state

**Files:**
- Modify: `src/recipes/components/GroceryListView.test.jsx`
- Modify: `src/recipes/components/GroceryListView.jsx`

**Interfaces:**
- Preserves all current grocery actions and accessible names.
- Produces a progress-led header, compact utility controls, a clear `Add an item` section, flat recipe context, and actionable empty state.

- [ ] **Step 1: Write failing semantic hierarchy tests**

Assert the `Add an item` heading labels its form, empty copy says what happened and what to do next, and the Browse recipes action remains present.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- src/recipes/components/GroceryListView.test.jsx`

- [ ] **Step 3: Implement hierarchy and copy changes**

Reduce toolbar competition, strengthen Complete Trip, flatten recipe context to rules and whitespace, label the add form, remove the oversized empty illustration, and use concise copy.

- [ ] **Step 4: Run the grocery tests**

Run: `npm test -- src/recipes/components/GroceryListView.test.jsx`

Expected: all tests pass.

### Task 4: Restore and polish the responsive recipe editor

**Files:**
- Modify: `src/recipes/components/RecipeEditor.test.jsx`
- Modify: `src/recipes/components/RecipeEditor.jsx`
- Modify: `src/styles/special-effects.css`

**Interfaces:**
- Preserves existing editor callbacks and fields.
- Produces an explicit centered desktop dialog, a flex-column form shell, a scrolling content region, persistent actions, and full-screen mobile safe-area behavior.

- [ ] **Step 1: Write failing editor shell tests**

Assert the dialog, form, scroll region, and action region expose stable semantic/test hooks; verify every editable ingredient/step control uses the shared editor input treatment rather than 12px text.

- [ ] **Step 2: Run the editor tests and verify they fail**

Run: `npm test -- src/recipes/components/RecipeEditor.test.jsx`

- [ ] **Step 3: Implement the editor shell and hierarchy**

Use an explicit valid viewport-based desktop width and auto margins, cap height, move overflow to the content body, keep header/footer visible, improve section rhythm, and separate the delete area. Preserve the mobile full-screen breakpoint and add safe-area padding.

- [ ] **Step 4: Run editor tests**

Run: `npm test -- src/recipes/components/RecipeEditor.test.jsx`

Expected: all tests pass.

### Task 5: Standardize library empty states

**Files:**
- Modify: `src/recipes/components/RecipeLibrary.test.jsx` if present; otherwise add focused coverage to `src/recipes/RecipeApp.test.jsx`
- Modify: `src/recipes/components/RecipeLibrary.jsx`

**Interfaces:**
- Preserves filtering and navigation.
- Produces concise favorites and no-results explanations with one obvious action.

- [ ] **Step 1: Write failing empty-state tests**

Assert favorites uses `No favorites yet.` plus the bookmark guidance and Browse all recipes action. Assert filtered no-results offers Clear filters or Browse all recipes.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- src/recipes/RecipeApp.test.jsx`

- [ ] **Step 3: Implement concise empty-state copy and actions**

Update copy and retain restrained typography without adding decorative containers.

- [ ] **Step 4: Run focused library tests**

Run: `npm test -- src/recipes/RecipeApp.test.jsx`

Expected: all tests pass.

### Task 6: Responsive and regression verification

**Files:**
- Modify only if verification reveals a regression in an in-scope file.

**Interfaces:**
- Consumes the completed changes from Tasks 1-5.
- Produces evidence for behavior and visual parity.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: zero failures.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint`

Run: `npm run build`

Expected: both exit successfully without new warnings.

- [ ] **Step 3: Inspect responsive surfaces in the browser**

Check grocery and editor surfaces at 320, 390, 768, 1024, and 1440px. Confirm no horizontal overflow, safe-area-aware toast placement, readable controls, centered desktop editor, full-screen mobile editor, and compact toolbar behavior.

- [ ] **Step 4: Review the final diff against the approved spec**

Confirm completion ownership, failure semantics, toast placement, grocery hierarchy, editor behavior, and empty-state actions are each represented and that no unrelated behavior changed.
