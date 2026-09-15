# Architecture

MISE is a React 19 single-page application built with Vite. It uses hash routes
for the recipe shelf, recipe details, grocery list, and sign-in flow.

## Project layout

- `src/recipes/RecipeApp.jsx` coordinates account, recipe, and grocery state.
- `src/recipes/components/` contains views and their component tests.
- `src/components/ui/` contains reusable interface controls shared across views.
- `src/recipes/library.js` handles recipe validation, search, and local storage.
- `src/recipes/groceries.js` contains grocery normalization, selectors, offline
  mutations, and reconciliation.
- `src/recipes/cloud.js` is the browser-side Supabase adapter.
- `src/recipes/ai.js` calls the server-side AI endpoints.
- `api/ai/` contains Vercel functions for recipe parsing, refinement, and cover
  generation.
- `server/` contains server-only helpers.
- `supabase/migrations/` contains append-only database migrations.

Components should not call Supabase directly. Keep domain logic outside React
components when it can be expressed and tested as a pure function.

## Data

Published recipes live in `src/recipes/data/recipes.json`. Guest data uses browser
storage. Signed-in data is account-owned in Supabase and protected by row-level
security. Grocery changes use an offline mutation queue and revisioned server
updates.

After changing published recipes, run `npm run seed:generate` and commit the
updated `supabase/seed.sql`.

## CSS

Styles load in this order:

1. `recipes-base.css`
2. `recipes-detail-editor.css`
3. `recipes-overlays.css`
4. `recipes-grocery.css`
5. `recipes-library.css`

Keep styles in the file that owns the feature and preserve this import order.
Avoid adding late overrides solely to win the cascade. `npm run css:audit`
protects the current CSS size and complexity budget.

## Development

- Work on feature branches, not `main`.
- Keep component tests beside their components.
- Add new database migrations instead of editing applied migrations.
- Never expose server keys through `VITE_` variables.
- Run `npm run check` before opening a pull request.
