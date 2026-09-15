# Phase 9: Final Legacy Cleanup

## Objective
Retire remaining legacy stylesheet imports from `src/recipes/main.jsx`, leaving only `../tailwind.css` and a tiny `special-effects.css`. Conduct final visual regression audits and certification.

## Scope & Actions
1. **Stylesheet Imports**:
   - Verify `main.jsx` imports only `../tailwind.css` and `src/styles/special-effects.css`.
   - Delete obsolete legacy CSS files.
2. **Dual-Metric Audit Verification**:
   - Legacy CSS reduced to < 2 KB (exceptions only).
   - Production bundle CSS optimized and flat/reduced.
3. **End-to-End Regression Test**:
   - Compare all views against Phase 0 baselines.
   - Run full test suite (`npm test`).
   - Run production build (`npm run build`).
4. **Master Plan Sign-Off**:
   - Mark all phases complete in `master-plan.md`.

## Success Criteria
- [x] ~~No legacy CSS files remaining in `src/recipes/`.~~
- [x] ~~Production build clean and optimized.~~
- [x] ~~155/155 tests passing.~~
- [x] ~~Master plan marked done and committed.~~
