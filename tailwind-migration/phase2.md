# Phase 2: Shared Controls & Shell Primitives

## Objective
Create reusable React UI primitives (`Button`, `IconButton`, `TextButton`, `Badge`) and migrate shell controls (`AppHeader`, navigation, account buttons) to prevent repeating 20+ utilities across 70+ call sites.

## Target Primitives & Components
1. `src/components/ui/Button.jsx` (`variant="primary" | "light" | "ghost"`)
2. `src/components/ui/IconButton.jsx` (`variant="default" | "glass"`, `active`)
3. `src/components/ui/TextButton.jsx`
4. `src/recipes/components/AppShell.jsx` (`AppHeader`, brand, navigation buttons, account chip)

## Rules
- Primitives must remain lightweight and typed/predictable.
- Remove legacy `.button`, `.icon-button`, `.text-button`, `.app-header` classes from legacy stylesheet.
- Test against all viewports (Desktop 1440px, Tablet 768px, Mobile 390px).

## Success Criteria
- [x] UI primitives created and used in shell.
- [x] Header and shell controls migrated to Tailwind utilities + primitives.
- [x] Legacy `.button`, `.icon-button`, `.app-header` rules removed.
- [x] Tests pass (155/155).
- [x] Clean commit for Phase 2.

