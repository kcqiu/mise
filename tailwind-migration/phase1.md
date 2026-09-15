# Phase 1: Migrate Tiny Leaf Components

## Objective
Migrate small, self-contained leaf components where visual regressions are trivial to isolate and verify. Remove legacy CSS for these components completely to prevent zombie styles.

## Target Components
1. `ToastStack.jsx` (toast notifications container and pills)
2. `AppFooter.jsx` (copyright, editorial links, footnote)
3. `RecipeArtwork.jsx` (artwork container, image aspect ratios, sprout placeholder)
4. Simple notice banners (`.app-notice`, backup notices)

## Workflow per Component
1. Translate CSS rules to Tailwind utilities in JSX.
2. Verify visual appearance against baseline.
3. Remove only selectors owned by that component from legacy CSS (`recipes.css`).
4. Run `npm test` and `npm run build`.
5. Verify zero competing styles remaining.
6. Commit changes.

## Success Criteria
- [ ] All 4 leaf components styled purely with Tailwind utilities.
- [ ] Owned legacy CSS selectors removed from legacy stylesheet.
- [ ] Tests pass (155/155).
- [ ] Clean commit for Phase 1.

