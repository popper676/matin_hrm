# Implementation completion — Release 016

The agreed items 1–4 are implemented in source. Owner configuration and final acceptance on the real installation remain explicit tasks, because currency limits, people, logos and business records must come from the company.

| Agreed item | Implemented result | Owner supplies |
| --- | --- | --- |
| 1. Amount-based Expense approval | Owner chooses standard or amount routing; per-currency AGM limits; independent CEO escalation; separate payment action; alternate reviewers; exact-route preview; immutable submission policy snapshots. | Real AGM/CEO/payment people, alternates and currency limits. |
| 2. Shared UI/UX | New materials, type hierarchy, cards, fields, tables, dialogs, shared shell and compact SVG app icons across both portals; desktop app spotlight with a separate reading area; mobile info dialog; English/Myanmar and light/dark layouts; reduced-motion support. | Current brand/logo/accent and personal display preference. |
| 3. Owner Setup | Seven saved, fingerprinted reviews link to real business, membership, account, permission, approval, leave and payroll configuration. Expense mode/limits/people participate in approval readiness and invalidate stale reviews. No sample employee or guessed salary is added. | Actual business memberships, scopes, leave entitlements and reviewed salary inputs. |
| 4. Feature inventory and manuals | Built-in searchable Owner and Employee guides in English/Myanmar, permission-aware app links and downloadable Markdown. Editable company articles remain separate. This file records the implementation scope. | Company-specific policy wording in the existing HR manual, if desired. |

## Current HR capabilities

| Area | Available functions |
| --- | --- |
| Identity & navigation | Owner-controlled personal/management apps and actions; employee scope; sensitive Salary/Bank/Identity fields; first-login password change; Apps Home, favorites, search, app explanations, Back, EN/MM and light/dark. |
| Brand & businesses | Shared brand/logo/accent/email wording; active/archived businesses; effective-dated multi-business membership; optional cost allocation; one employee and one monthly salary per person. |
| Employee records | Basic employee records, linked accounts, bulk import with per-row atomic credentials, Employee 360 and controlled information-form review. |
| Organization | Departments, positions, reporting lines and job assignments. These do not automatically grant permissions. |
| Attendance | Photo and QR check-in/out, scoped records, schedules, shifts, weekday rosters, off days, approved overtime and supported biometric mappings. Bangkok calendar boundaries apply. |
| Leave | Company work calendar, paid/unpaid types, yearly entitlements, working-time quotes, full/half/hour forms, assigned review, conditions and linked coverage handover. |
| Salary | Supplied 23-column Salary Template, saved/versioned inputs and totals, THB Excel, own/scoped payslip PDFs, Pending/Paid and guarded payment. Historical payroll and the legacy calculation workspace remain available separately. |
| Expenses | Full request/attachment form, standard or currency-threshold route, conditional/reduced authorization, original-amount CEO escalation, private evidence/PDF, approved-unpaid tracking, actual payment and append-only receipts. |
| Recruitment | Job openings, JD/requirements, source-file upload/extraction, reviewed publication to Careers, applications, interview actions, optional AI assessment and guarded employee conversion. |
| Lifecycle | Onboarding task checklists; offboarding clearance and exit survey; outgoing/incoming handover; successor acknowledgment; required-item/version checks; controlled settlement release. |
| Probation & warnings | Original structured forms, assigned reviews, employee self-response/receipt, private HR records and generated documents, with human decisions. |
| Documents | Private employee files and staged document signing/issuance; reviewed/issued histories and referenced shared files are retained. |
| Tasks & performance | SOP templates/assignments/reports/proof, all due personal tasks, peer voting, KPI inputs and scoped performance calculations. |
| Operations | Today follow-ups, Monthly review, payroll changes, business cost views, separate currencies, expense receipt evidence and optional deduplicated in-app reminders. |
| Communication & guidance | Announcements, birthday notifications, searchable built-in operating guides, editable/published HR manual and optional configured recruitment email. |
| Owner oversight | Audit history, executive views and an optional HR assistant with bounded data access and explicit action confirmation. |

## Expense policy details

- **Default:** the existing standard route remains selected after migration. Switching modes requires the Owner to save.
- **Amount mode:** at or below the currency limit, AGM → payment. Above the limit, AGM → CEO → payment. An unconfigured currency always goes through CEO; currency conversion is never inferred.
- A zero limit means all positive amounts need CEO review. An empty limit list grants no AGM-only route. Setup asks the Owner to record at least one explicit currency choice.
- The **original** request amount determines the route. Reducing approval does not remove CEO review. The selected route and policy version are retained for that request even if settings change later.
- AGM and CEO review must be independent people. Each actor still needs current permission. The person recording payment may also hold another company responsibility, but payment is a separate authorized action and nobody can decide/pay their own request.
- A missing/disabled reviewer or missing alternate for an own request blocks submission/decision visibly. Draft previews create no request, payment or notification.
- Payment records an actual settlement; it does not initiate a bank transfer. A final payment cannot exceed authorization and must use the request currency.

## Install into an existing HR project

1. Stop both development servers. Pull main from the project root.
2. Apply any missing migrations 013, 014 and 015 in order, then **016_hr_completion.sql**, in the existing HR Supabase SQL Editor. Do not recreate the project or run the fresh schema against existing data.
3. Start the API and frontend again in separate terminals; sign in again.
4. Owner opens Approval Setup → Expense to choose the route and enter real people/limits. Then use Owner Setup to review business memberships, access, leave and payroll. Built-in guides are in User Manual and the account menu.

```sh
git pull --ff-only origin main
pbcopy < supabase/016_hr_completion.sql
```

```sh
npm run dev --prefix server
```

```sh
npm run dev --prefix hrm-client
```

No new dependency packages are required. The migration is additive, rerunnable and preserves existing requests and histories. Source is not evidence that the migration or real-company configuration has already been applied on the user's Mac/Supabase instance.

## Manuals and maintenance

- [Owner guide — မြန်မာ](guides/OWNER_GUIDE_MY.md)
- [Employee guide — မြန်မာ](guides/EMPLOYEE_GUIDE_MY.md)
- [Owner guide — English](guides/OWNER_GUIDE_EN.md)
- [Employee guide — English](guides/EMPLOYEE_GUIDE_EN.md)

The in-app and downloadable guides use shared/systemGuides.json as their source. After editing it, run `npm run docs:guides`. Tests check audience/language parity, actual route links and downloadable copies.

## Verification boundary

Automated checks use isolated data and cover threshold boundaries, per-currency rules, unknown currencies, alternate selection, stale configuration, permission revocation, original-amount escalation, final approval/payment state, preserved historical routes and migration reruns. Actual API tests verify Owner and employee endpoints. Browser checks cover the new route editor, both launcher experiences, mobile/desktop EN/MM light/dark, guides and existing HR form flows. Final manual acceptance is deferred until the user's configuration is ready.

This release does not add a closed accounting period, budget reservation ledger, automatic bank transfers, automatic employment decisions, online hosting or a new production backup service. Those remain separate scopes.
