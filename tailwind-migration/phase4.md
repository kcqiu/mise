# Phase 4: Recipe Shelf (Library & Card)

## Objective
Migrate the central browse experience (`RecipeLibrary` and `RecipeCard`), including search/filter tools, category navigation, shelf grid, and empty states.

## Target Components
1. `RecipeLibrary.jsx` (hero banner, search row, collection tabs, category pills, sort dropdown)
2. `RecipeCard.jsx` (card layout, full-bleed artwork, gradient overlay, glass bookmark, "See Recipe" action)
3. Empty state & shelf footnote

## Rules
- Use full literal strings with `cn()` for dynamic states (e.g., `cn("...", active && "...")`).
- Do NOT use dynamic class interpolation (`bg-${color}`).
- Responsive breakpoints: 3 columns desktop, 2 columns tablet (`max-[1150px]:grid-cols-2`), 1 column mobile (`max-[600px]:grid-cols-1`).
- Remove shelf and card selectors from legacy CSS.

## Success Criteria
- [x] RecipeLibrary and RecipeCard styled with Tailwind utilities.
- [x] Shelf legacy CSS rules removed.
- [x] Tests pass (155/155).
- [x] Clean commit for Phase 4.
