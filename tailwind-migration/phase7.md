# Phase 7: Recipe Detail (Design North Star)

## Objective
Migrate `RecipeDetail` (the design north star) to Tailwind utilities with strict pixel parity.

## Target Components
1. `RecipeDetail.jsx` (hero header, 5:4 aspect ratio image, servings stepper, unit system pill [Original / US / Metric], cooking mode layout, ingredient checklist, step directions, keep awake toggle)

## Rules
- Match exact typographical sizes and line heights (`text-[43px] md:text-[52px] leading-[1.08]`).
- Do not approximate measurements with default scale steps.
- Keep complex pseudo-element styling (`.switch-track::after`) in `special-effects.css`.
- Remove all remaining `.recipe-detail-*` rules from legacy CSS.

## Success Criteria
- [ ] RecipeDetail fully migrated to Tailwind utilities.
- [ ] Visual pixel parity verified across Desktop, Tablet, and Mobile.
- [ ] All 5 RecipeDetail vitest tests pass.
- [ ] Clean commit for Phase 7.
