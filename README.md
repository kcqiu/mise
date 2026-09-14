# mise.

Personal recipe library built with React, Vite, and Supabase.

## Local development

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` when Supabase authentication is enabled.

## Production

The Vercel project should use:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

The public deployment is intended to be unlisted and uses `noindex, nofollow`.
