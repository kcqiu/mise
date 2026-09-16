# Tailwind Production Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tailwind migration visually indistinguishable from production across supported viewports and restore trustworthy Google sign-in branding guidance.

**Architecture:** Keep the migrated React structure and Tailwind v4 entrypoint. Translate production values exactly into component utilities, reserving small semantic component rules for cascade-sensitive or responsive behavior, then verify against `origin/main` with automated behavior tests and browser screenshots.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4, Vitest, Testing Library, Supabase Auth.

**Spec:** `docs/superpowers/specs/2026-09-15-tailwind-production-parity.md`

## Global Constraints

- `origin/main` is the visual source of truth.
- Preserve functionality, data shape, routes, and component behavior.
- Cover 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, and 1600 pixel widths.
- Keep the Tailwind migration; do not restore the deleted legacy stylesheets.
- Do not modify or merge `main`.

---

### Task 1: Add parity regression coverage

**Files:**
- Modify: `src/recipes/RecipeApp.test.jsx`
- Modify: `src/recipes/components/RecipeDetail.test.jsx`
- Modify: `src/recipes/cloud.test.js`

**Interfaces:**
- Consumes: existing application render helpers and Supabase client mock.
- Produces: regression coverage for production header copy, ingredient count presentation, and OAuth redirect behavior.

- [ ] **Step 1: Add a failing shell parity test**

  Render the signed-out application and assert that `mise.` remains the labelled home link, the visible header has no production-hidden caption, and Sign in is a transparent semantic button rather than a generic `.button` control.

- [ ] **Step 2: Run the targeted test and verify the migrated markup fails**

  Run `npm test -- src/recipes/RecipeApp.test.jsx` and confirm the failure identifies the visible caption or sign-in treatment.

- [ ] **Step 3: Add a failing recipe-detail count test**

  Render a recipe with a literal six-item fixture and assert the ingredient heading exposes `6 items` in the same heading group without altering the grocery action.

- [ ] **Step 4: Run the targeted detail test and verify the expected failure**

  Run `npm test -- src/recipes/components/RecipeDetail.test.jsx`.

- [ ] **Step 5: Add or retain the OAuth redirect contract test**

  Assert `signInWithGoogle()` calls `signInWithOAuth` with provider `google` and `redirectTo: window.location.origin`; this protects application redirect behavior while leaving Google branding to provider configuration.

### Task 2: Restore shell and shelf parity

**Files:**
- Modify: `src/recipes/components/AppShell.jsx`
- Modify: `src/recipes/components/RecipeLibrary.jsx`
- Modify: `src/tailwind.css`

**Interfaces:**
- Consumes: production values from `origin/main:src/recipes/recipes-base.css` and `recipes-library.css`.
- Produces: exact shell widths, header controls, typography, banner, search tools, category navigation, and responsive gutters.

- [ ] **Step 1: Correct the global responsive container contract**

  Match production widths: `min(1312px, 100% - 48px)` by default, `min(1360px, 100% - 160px)` at 1500px+, `calc(100% - 72px)` at 1150px and below, `calc(100% - 48px)` at 800px and below, and `calc(100% - 36px)` at 580px and below.

- [ ] **Step 2: Restore exact header behavior**

  Remove the visible desktop caption, restore transparent sign-in styling, and match production mobile dimensions for branding, grocery, add-recipe, and account controls.

- [ ] **Step 3: Restore exact shelf typography and spacing**

  Remove conflicting title utilities, match the 48px/34px production title sizes, exact banner geometry, tool spacing, and grid breakpoints.

- [ ] **Step 4: Run the shell tests**

  Run `npm test -- src/recipes/RecipeApp.test.jsx` and keep the suite green.

### Task 3: Restore recipe card rendering

**Files:**
- Modify: `src/components/ui/culinary-card-21.jsx`
- Modify: `src/recipes/components/RecipeCard.jsx`
- Modify: `src/tailwind.css`

**Interfaces:**
- Consumes: production card values from `origin/main:src/components/ui/culinary-card-21.css`.
- Produces: exact 480px/420px card heights, image crop, overlay gradient, shadows, type, controls, and hover states.

- [ ] **Step 1: Compare every generated card declaration with production**

  Check min-height, border radius, shadow, background positioning, gradient stops, favorite control, content padding, title, description, metadata, and action row.

- [ ] **Step 2: Replace Tailwind declarations that compile differently**

  Use exact arbitrary values or one semantic component rule where the generated gradient or transition differs from production CSS.

- [ ] **Step 3: Verify keyboard and favorite behavior**

  Run the recipe application tests and manually exercise card link and favorite controls.

### Task 4: Restore recipe-detail parity

**Files:**
- Modify: `src/recipes/components/RecipeDetail.jsx`
- Modify: `src/recipes/components/RecipeArtwork.jsx`
- Modify: `src/recipes/components/RecipeVideo.jsx`
- Modify: `src/tailwind.css`

**Interfaces:**
- Consumes: production detail values from `origin/main:src/recipes/recipes-detail-editor.css`.
- Produces: exact hero, metadata, cooking bar, ingredient count, list, method, notes, and mobile screen-awake layout.

- [ ] **Step 1: Correct detail container, hero, and typography values**

- [ ] **Step 2: Correct cooking bar placement at 640px and below**

  Preserve the two-row mobile composition so progress and Keep screen awake remain visible without horizontal clipping.

- [ ] **Step 3: Correct ingredient heading and count styling**

  Match production inheritance and spacing for the nested count while preserving the single grocery action.

- [ ] **Step 4: Correct ingredients, method, video, and notes responsive values**

- [ ] **Step 5: Run recipe-detail tests**

  Run `npm test -- src/recipes/components/RecipeDetail.test.jsx`.

### Task 5: Restore remaining surface parity

**Files:**
- Modify: `src/recipes/components/GroceryListView.jsx`
- Modify: `src/recipes/components/RecipeEditor.jsx`
- Modify: `src/recipes/components/AddRecipeModal.jsx`
- Modify: `src/recipes/components/AuthModal.jsx`
- Modify: `src/recipes/components/ToastStack.jsx`
- Modify: `src/styles/special-effects.css`
- Modify: `src/tailwind.css`

**Interfaces:**
- Consumes: production values from the grocery, overlays, and detail/editor stylesheets on `origin/main`.
- Produces: matching grocery, editor, modal, auth, toast, focus, hover, and responsive states.

- [ ] **Step 1: Audit each migrated component against its production selector block**

- [ ] **Step 2: Correct only declarations with a measurable mismatch**

- [ ] **Step 3: Run component tests for grocery, editor, auth, and add-recipe flows**

  Run `npm test -- src/recipes/components/GroceryListView.test.jsx src/recipes/components/RecipeEditor.test.jsx src/recipes/components/AuthModal.test.jsx src/recipes/components/AddRecipeModal.test.jsx`.

### Task 6: Resolve Google sign-in branding boundary

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `src/recipes/cloud.test.js` only if the redirect contract is uncovered.

**Interfaces:**
- Consumes: the live Supabase project URL and current Supabase Google OAuth/custom-domain documentation.
- Produces: correct application redirect behavior and concise operator steps for Google Branding plus a Supabase custom or vanity domain.

- [ ] **Step 1: Confirm the live project has no branded API domain**

- [ ] **Step 2: Document Google Auth Platform Branding requirements**

  Set application name to `MISE`, upload the MISE logo, configure the production origin, and publish/verify the brand as required by Google.

- [ ] **Step 3: Document the branded callback requirement**

  Add both `https://spalxnqfgizpkeqxpxwv.supabase.co/auth/v1/callback` and the activated custom/vanity callback URL to the Google OAuth client before activating the Supabase domain.

- [ ] **Step 4: Run the cloud auth test**

  Run `npm test -- src/recipes/cloud.test.js`.

### Task 7: Full responsive and build verification

**Files:**
- Modify: only files needed to correct issues found during verification.

**Interfaces:**
- Consumes: completed parity implementation.
- Produces: verified browser behavior and a clean repository check.

- [ ] **Step 1: Run the full automated check**

  Run `npm run check` and resolve only migration-related failures.

- [ ] **Step 2: Compare shelf screenshots**

  Compare production and migration at 320, 390, 768, 1024, 1440, and 1600 pixels, including default, search, category, and favorites states.

- [ ] **Step 3: Compare application surfaces**

  Compare recipe detail, grocery list, editor, auth modal, and add-recipe modal. Check hover, focus, favorite, progress, and mobile screen-awake states.

- [ ] **Step 4: Verify browser health**

  Confirm no horizontal overflow, missing images, console errors, or clipped controls.

- [ ] **Step 5: Review the final diff against `origin/main`**

  Confirm only Tailwind parity, tests, and concise auth configuration guidance changed.

