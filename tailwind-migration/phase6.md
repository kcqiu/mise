# Phase 6: Recipe Editor

## Objective
Migrate `RecipeEditor` forms, ingredient list builder, step reordering, cover photo controls, and deletion flows to Tailwind.

## Target Components
1. `RecipeEditor.jsx` (editor header, photo upload / URL controls, ingredient row controls, step instructions, prep/cook timing inputs, danger zone deletion)

## Rules
- Decouple editor styles from detail page styles.
- Preserve all form inputs, validation attributes, and keyboard navigation.
- Remove all `.editor-*` rules from legacy CSS.

## Success Criteria
- [x] RecipeEditor fully migrated to Tailwind utilities.
- [x] All 11 RecipeEditor vitest tests pass.
- [x] Legacy editor CSS rules removed.
- [x] Clean commit for Phase 6.
