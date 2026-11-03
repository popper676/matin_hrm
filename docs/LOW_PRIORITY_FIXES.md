# Low-priority audit fixes

| Finding | Result |
| --- | --- |
| F11 — Frontend lint configuration cannot load | Declare and lock the missing React Hooks and Fast Refresh plugins with ESLint 10 support. Keep JavaScript correctness and the existing React 18 hook rules enabled, use ESM in the Tailwind configuration, remove unused bindings, use Vite's browser-safe development flag, and resolve hook dependency warnings. Run the frontend lint command in GitHub CI. |
| F23 — Duplicate Peer Voting handlers | Already removed in the F17 medium-priority fix in PR #12. The current router has one management-list handler and one submit handler, plus the distinct minimal colleague-list endpoint. Existing route/database regression checks cover personal-only voting, a successful submission and rejection of a duplicate monthly vote. No second implementation or database change is needed. |

## Lint policy

Run `npm run lint --prefix hrm-client`. Syntax, undefined variables, unused bindings and invalid hook calls fail the check. Hook dependencies and Fast Refresh boundaries are reported as warnings. The app uses React 18 without React Compiler, so its existing hooks contract is configured explicitly rather than introducing the additional compiler preset in this maintenance update.

The current result is **0 errors and 8 Fast Refresh warnings**. Those warnings identify existing files that export both a component/provider and a helper, hook or icon map: `Icon.jsx`, `LeaveForm.jsx`, `LeaveRequestActionsMenu.jsx`, `OpsUI.jsx` (two exports), and the Auth, Brand and Language contexts. They concern development hot reloading and remain visible; the check does not suppress them or treat them as production errors. Splitting these shared exports can be done as a separate module-organization change. No hook dependency warnings remain.

## Update an existing Mac installation

1. Stop the running frontend terminal with **Control+C**.
2. From the existing repository root, run:

   ```sh
   git pull --ff-only origin main
   npm ci --prefix hrm-client
   ```

3. Restart it with `npm run dev --prefix hrm-client`. Keep the API server running, or restart it in another terminal with `npm run dev --prefix server` if it was stopped.

This update adds development dependencies only. It needs no new SQL migration and does not reset accounts or employee records. Migration `013_medium_priority.sql` from PR #12 is still required if that earlier update has not yet been applied to the existing database.

## Verification

Frontend lint, a production build, source checks, dependency auditing and the existing automated backend/payroll/browser/container checks validate this change. ESLint is also exercised against valid JSX and intentional undefined-variable/invalid-hook examples to confirm that it catches errors instead of merely exiting successfully. Checks use the existing isolated fixtures. Manual user acceptance testing remains deferred.
