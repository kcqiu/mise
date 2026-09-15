# Phase 0: Migration Foundation

## Objective
Establish Tailwind CSS v4 environment, unify design tokens, configure alias pathing and utilities, set up baseline screenshot captures, and establish dual-metric CSS auditing without altering any component UI.

## Scope & Actions
1. **Tooling & Packages**:
   - Install `tailwindcss` (`^4.3.3`) and `@tailwindcss/vite` (`^4.3.3`).
   - Install `clsx` and `tailwind-merge`.
   - Update `vite.config.js` and `vitest.config.js` with `tailwindcss()` plugin and `@/` path alias.
2. **Unified Tokens (`src/tailwind.css`)**:
   - Define `@import "tailwindcss";`.
   - Define `@theme` mapping for colors (`--color-paper`, `--color-ink`, `--color-muted`, `--color-terracotta`, `--color-line`, `--color-sand`, `--color-accent`, `--color-green`), fonts (`--font-serif`, `--font-sans`), and radii.
   - Define `:root` compatibility aliases so legacy CSS and Tailwind utilities share the exact same values.
   - Import `src/tailwind.css` in `src/recipes/main.jsx`.
3. **Consolidated Helpers (`src/lib/utils.js`)**:
   - Create single canonical `cn(...inputs)` helper combining `clsx` and `tailwind-merge`.
4. **CSS Audit & Baseline Metrics**:
   - Create/update `scripts/css-audit.mjs` tracking both legacy CSS size/rules/selectors and production built CSS size.
5. **Baseline Verification**:
   - Run full test suite (`npm test`) and production build (`npm run build`).

## Success Criteria
- [x] Tailwind v4 compiles cleanly in Vite.
- [x] Unified tokens active in both CSS variables and Tailwind utilities.
- [x] 100% of automated tests pass.
- [x] Zero visual regressions on unmigrated UI.
