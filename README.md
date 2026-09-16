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
| `VITE_GOOGLE_CLIENT_ID` | Public Google Web OAuth client ID |
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

### Google sign-in branding

MISE uses Google Identity Services to obtain a Google ID token, then exchanges
that token for the existing Supabase session. In Google Auth Platform:

1. Add the app's deployment URL as an Authorized JavaScript Origin.
2. Set the OAuth app name and logo to **MISE**, then verify and publish the
   branding.
3. Use the same Web OAuth client ID configured for the Supabase Google provider
   as `VITE_GOOGLE_CLIENT_ID`. Keep the client secret server-side in Supabase.

Google may still show the authorized app domain as a security signal, but the
Supabase project hostname is no longer part of the browser sign-in flow.

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
