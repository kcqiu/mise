# Tailwind Production Parity Design

## Goal

Make `refactor/tailwind-migration-foundation` visually match `origin/main` at mobile, tablet, and desktop sizes while retaining the Tailwind migration and all existing application behavior.

## Visual source of truth

`origin/main` is authoritative for layout, typography, color, responsive behavior, and component states. The migration may use Tailwind utilities or a small semantic rule in `src/tailwind.css`, but it must not reinterpret the design.

## Approach

- Compare the migrated JSX and generated CSS against the production component markup and legacy CSS.
- Correct exact values in the shell, recipe shelf, cards, recipe detail, grocery view, editor, authentication, and overlays.
- Preserve the semantic class names already present so state and responsive selectors remain understandable.
- Use component-level Tailwind utilities for ordinary declarations and `@layer components` only for selectors that are clearer as shared state, pseudo-element, or media-query rules.
- Verify layout at 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, and 1600 pixels.

## Authentication regression

Google's account chooser currently advertises the Supabase project hostname. The application code has always used the same `signInWithOAuth` call, and the live project exposes only its default project URL. The repair therefore has two boundaries:

- Keep the application redirect behavior covered by a test.
- Configure Google OAuth branding and, when the Supabase plan/domain permits, a branded custom or vanity Supabase domain. Repository documentation must state the required dashboard settings because the chooser label is not controlled by React or CSS.

## Non-goals

- No redesign.
- No data, schema, routing, or interaction changes.
- No restoration of the deleted legacy stylesheet set.
- No changes directly to `main`.

