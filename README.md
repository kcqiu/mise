# MISE

Personal recipe library built with React, Vite, and Supabase. System recipes are
available to everyone; signed-in cooks can create a private collection and sync
favorites and cooking progress across devices.

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` when Supabase authentication is enabled.

## Supabase setup

1. Apply the SQL files in `supabase/migrations` in filename order.
2. Run `npm run seed:generate` after changing the system recipe JSON.
3. Run `supabase/seed.sql` in the SQL Editor to publish the system collection.
4. Enable Google in Authentication > Providers.
5. Configure `private.hook_restrict_signup_by_email` as the Postgres
   `before-user-created` Auth hook. Approved accounts live in
   `private.signup_allowlist`.
6. Add approved email addresses to `private.signup_allowlist` using the
   dashboard SQL Editor. This list is intentionally not included in source control.
7. Set the Auth Site URL to your deployed application URL. Add local development
   URLs to the redirect allowlist only when needed.

The browser receives only the Supabase project URL and publishable key. Never
place a secret key, service-role key, Google client secret, or database password
in a `VITE_` variable.

## Production

The Vercel project should use:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

The public deployment is intended to be unlisted and uses `noindex, nofollow`.

## Persistence

When cloud configuration is present, Google sign-in unlocks recipe creation.
Recipes, favorites, and cooking progress are account-owned and protected by RLS.
Any existing browser-saved library is imported once after the first successful
sign-in. Without cloud configuration, the app retains its original local-only
behavior for development and recovery.

## Instagram recipe imports

Automatic imports from other creators' public Instagram posts use the server-only
`CHOCODATA_API_KEY`, alongside `GEMINI_API_KEY`. Meta account IDs and app secrets
do not enable arbitrary post caption lookup. Pasted captions skip ChocoData.
See [setup, architecture and limitations](docs/instagram-import.md).

## Checks

```bash
npm test
npm run build
```

Run `supabase/verify.sql` to check the schema, account policies, and signup hook.
