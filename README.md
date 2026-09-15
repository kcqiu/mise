# MISE

MISE is a personal digital cookbook for saving recipes, cooking from them, and
turning planned meals into a grocery list.

The app includes:

- A searchable recipe shelf with categories and favorites
- Recipe creation and import from text, photos, websites, and social posts
- Adjustable servings, unit conversion, and cooking progress
- A grocery list generated from selected recipes
- Optional Google sign-in and Supabase sync across devices

## Local setup

MISE requires Node.js 24.

```bash
npm install
npm run dev
```

The app works with browser storage when Supabase is not configured. For account
sync and AI features, copy `.env.example` to `.env.local` and add the required
values.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase key |
| `VITE_GOOGLE_CLIENT_ID` | Optional Google Identity Services client ID |
| `GEMINI_API_KEY` | Recipe parsing and refinement |
| `CHOCODATA_API_KEY` | Optional Instagram caption lookup |
| `CLOUDFLARE_ACCOUNT_ID` | AI cover generation |
| `CLOUDFLARE_API_TOKEN` | AI cover generation |

Never place server secrets in a `VITE_` variable.

Vite serves the frontend only. Run through a Vercel-compatible local runtime or
use a preview deployment when testing the functions in `api/`.

## Database setup

1. Apply the files in `supabase/migrations/` in filename order.
2. Run `npm run seed:generate` after changing the published recipe data.
3. Apply `supabase/seed.sql` to load the published recipes.
4. For account access, enable Google Auth and configure the signup hook created
   by the migrations.

Authentication, recipe data, favorites, progress, grocery sessions, and cover
storage are protected by Supabase row-level security policies.

## Checks

```bash
npm run check
```

This runs linting, CSS checks, tests, the production build, and seed verification.

## Deployment

The Vercel project uses the Vite preset, `npm run build`, and the `dist` output
directory. Configure the same environment variables for the target Vercel
environment.

See [Architecture](docs/architecture.md) for the project layout.
