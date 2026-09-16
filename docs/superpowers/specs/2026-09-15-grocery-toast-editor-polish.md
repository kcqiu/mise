# Grocery, Toast, Editor, and Empty-State Polish

## Goal

Make grocery completion notifications reliable, strengthen the grocery page hierarchy, restore the recipe editor as a polished responsive workspace, and make empty states concise and actionable without changing recipe or grocery data models.

## Approved behavior

- `RecipeApp` owns completion success and failure notifications for clear and rollover actions.
- `GroceryListView` requests completion and closes its confirmation dialog only after success.
- Signed-in cloud failures and revision conflicts do not clear the list locally and do not emit success notifications.
- Exact duplicate toasts created in a very short interval are defensively suppressed, but event ownership remains the primary fix.
- Toasts sit bottom-center above the safe area on phones and bottom-right on larger screens.
- Grocery progress and aisle content lead the page; secondary toolbar actions are compact and Complete Trip remains the strongest action.
- The desktop recipe editor is explicitly centered and sized, with a scrolling body and persistent actions. Mobile remains full-screen with safe-area padding and 16px editable controls.
- Empty states explain what happened and offer the obvious next action in MISE's concise editorial tone.

## Constraints

- Keep the current React, Tailwind, and component architecture.
- Do not change routing, recipe data, grocery data, authentication, or synchronization schemas.
- Preserve existing grocery mutation behavior outside trip completion.
- Preserve recipe editor save, delete, image, and AI behavior.
- Verify guest/local mode and signed-in cloud success, conflict, and failure paths where practical.

