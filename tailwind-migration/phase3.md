# Phase 3: Modals & Overlays

## Objective
Migrate modal dialogs and overlays to Tailwind while preserving necessary CSS exceptions for dialog backdrops and keyframe animations in a dedicated exceptions file.

## Target Components
1. `AuthModal.jsx` (Google login, guest continue, feature list)
2. `AddRecipeModal.jsx` (5 intake cards, manual entry, photo, website, social URL)
3. Account menu popover (`<details className="account-menu">`)
4. Grocery share modal / dialogs

## Rules
- Keep `dialog::backdrop` styling and modal keyframe animations in `src/styles/special-effects.css`.
- Translate internal layout, cards, buttons, and form controls to Tailwind utilities.
- Remove legacy modal classes (`.auth-modal`, `.add-recipe-modal`, `.account-menu`) from legacy stylesheet.

## Success Criteria
- [x] Modals styled with Tailwind utilities.
- [x] Dialog backdrop and animations preserved in `special-effects.css`.
- [x] Tests pass (155/155).
- [x] Clean commit for Phase 3.
