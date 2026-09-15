# MISE architecture

MISE is a single-page React application built with Vite. Keep feature work within
the existing boundaries below so visual and persistence concerns do not drift
back into one large file.

## Frontend boundaries

- `src/recipes/RecipeApp.jsx` owns application-level state, hash routing, account
  state, and coordination between recipe and grocery features.
- `src/recipes/components/` contains rendered views and colocated component tests.
- `src/recipes/library.js` owns recipe-library parsing, validation, and local
  persistence.
- `src/recipes/groceries.js` owns the grocery domain model, normalization,
  selectors, local queue, and reconciliation logic.
- `src/recipes/cloud.js` is the browser-side Supabase adapter. Components should
  not call Supabase directly.
- `src/recipes/ai.js` is the browser-side adapter for the server AI endpoints.

Prefer extracting cohesive helpers from the large orchestration files before
adding more responsibilities to them. Keep pure domain logic independent from
React so it can be tested without rendering components.

## Stylesheet order

`src/recipes/main.jsx` imports styles in this cascade order:

1. `recipes-base.css` — tokens, reset, global shell, and shared controls.
2. `recipes-detail-editor.css` — recipe detail, cooking flow, and editor.
3. `recipes-overlays.css` — authentication, toasts, and add-recipe flows.
4. `recipes-grocery.css` — shared actions, grocery list, and modal surfaces.
5. `recipes-library.css` — the recipe shelf and its responsive overrides.

Keep this order stable. Put a selector in the stylesheet for the feature that
owns it; do not append a second-generation override to the last file merely to
win the cascade. If a base rule must be overridden, keep the override close to
the feature and document why.

`npm run lint:css` checks CSS correctness. `npm run css:audit` enforces a modest
budget for total bytes, rules, files, and `!important` declarations. Increase a
budget only after reviewing why the added CSS cannot replace or extend an
existing rule.

## Server and data boundaries

- `api/` contains Vercel request handlers. Secrets belong here, never in a
  `VITE_` environment variable.
- `server/` contains server-only helpers shared by request handlers and their
  tests. Browser code must not import from this directory.
- `supabase/migrations/` is append-only. Add a new timestamped migration instead
  of editing a migration that may already have run.
- `supabase/seed.sql` is generated from the system recipe data. After changing
  `src/recipes/data/recipes.json`, run `npm run seed:generate` and commit both
  changes together.

## Tests and verification

Colocate component tests in `src/recipes/components/`. Keep domain tests beside
their source modules. Before opening a pull request, run:

```bash
npm run check
```

CI runs the same lint, CSS-budget, test, build, and seed-generation checks on
pull requests to `main`.

## Roadmaps

Future product plans belong in `docs/roadmaps/`, separate from current
architecture and setup documentation. Roadmaps are not implementation contracts;
validate them against the current schema and product behavior before starting.
