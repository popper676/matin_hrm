# Guided user acceptance testing

Test one workflow at a time with the user. Record observed results separately from automated validation. Dates use Asia/Bangkok.

## Big Step 1: Startup, Owner login and basic navigation

Date: 22 October 2026. Baseline: main `9674f7de4874ba1cacbf61481ee29da8afc8ecc9`.

| Check | User-reported result |
| --- | --- |
| API health | Passed |
| Owner login | Passed |
| Apps grid | Passed |
| Demo notice | Passed |
| Employees list and detail | Passed |
| Back, Apps Home and refresh | Passed |

User reported no errors. The launcher preference below is a modification request, not a failed test.

## Changes and issues

| ID | Type | Request | Status |
| --- | --- | --- | --- |
| MOD-001 | UI modification | Keep all app icons visible on hover. Retain the right-hand app details panel and remove redundant app tooltips in both portals. | Implemented; awaiting user retest |

### MOD-001 retest

1. Update the frontend and refresh Apps Home in the Owner portal.
2. Hover several apps: every icon and label must stay visible and in place; only the details panel changes.
3. Confirm no floating app-summary tooltip appears over the grid.
4. Use Tab to focus an app: its details must update without hiding any other app. Esc clears the details.
5. Open an app, return with Back or Apps Home, and confirm navigation still works.
6. Repeat hover and tooltip checks in the Employee portal.
7. At phone width, tap an app's Info button: the explicit details dialog must remain available. Close it and open the app normally.

Retest result: Not run by the user yet.

Future records use BUG-### for errors, MOD-### for changes to existing behavior and REQ-### for new features. Record the affected account type, page, reproduction steps, expected and actual results, and final retest outcome. Never record passwords, tokens or service keys.
