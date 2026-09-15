# Phase 8: Base Styles & Preflight Retirement

## Objective
Retire legacy base reset styles and consolidate global defaults (typography, focus-visible policy, font smoothing, reduced motion, root layout) into `@layer base` in `src/tailwind.css`.

## Target Scope
1. Global focus-visible styling (`:focus-visible`).
2. Typography resets (Fraunces serif headings, DM Sans body).
3. Tap highlight and font-smoothing rules.
4. Screen-reader only utility (`.sr-only`).
5. Reduced motion overrides (`@media (prefers-reduced-motion: reduce)`).

## Rules
- Migrate necessary global rules into `@layer base { ... }` in `src/tailwind.css`.
- Remove legacy `recipes-base.css` and `recipes-vars.css`.

## Success Criteria
- [ ] Global styling consolidated in `@layer base`.
- [ ] No unstyled native elements or broken focus rings.
- [ ] Tests pass (155/155).
- [ ] Clean commit for Phase 8.
