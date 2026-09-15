# Phase 5: Grocery Experience (GroceryListView)

## Objective
Migrate `GroceryListView` layout, aisle categories, checklist interactions, recipe chips, and servings steppers to Tailwind.

## Target Components
1. `GroceryListView.jsx` (grocery banner, empty state, active recipe cards, aisle groups, item checklists, share modal)

## Critical Constraints
- **Zero edits to business logic or sync**: `src/recipes/groceries.js` remains 100% untouched.
- Preserve all checklist interactive states and keyboard accessibility.
- Remove all `.grocery-*` and `.aisle-*` rules from legacy CSS.

## Success Criteria
- [x] GroceryListView fully migrated to Tailwind utilities.
- [x] Legacy grocery CSS rules removed.
- [x] All 30 grocery domain tests + 11 component tests pass.
- [x] Clean commit for Phase 5.
