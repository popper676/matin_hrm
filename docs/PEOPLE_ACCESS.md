# UYF People & Access and Approval Setup

This upgrade adds owner-assigned app permissions, employee data scopes, confidential-field permissions and configurable approval assignments. Job titles and legacy account roles no longer grant administrative access.

## Update an existing installation

Stop both development terminals with Ctrl+C. Open a terminal in the actual repository folder (the folder containing `server`, `hrm-client` and `supabase`). Do not guess a Downloads path.

```sh
git pull --ff-only origin main
npm ci --prefix server
npm ci --prefix hrm-client
pbcopy < supabase/004_people_access_approvals.sql
```

In the Supabase project already used by this HR system, open SQL Editor, create a query, paste and run it. This migration is additive and can be rerun. Do not rerun `001`, reset the database or create another owner. Existing users and HR records are retained.

The earliest active `boss`/`admin` account is designated as the owner once. Existing non-owner accounts initially receive personal apps only, until the owner grants management access. The owner flag is separate from role/job title, is not copied, and cannot be edited through ordinary account settings. The existing owner's employee record and account cannot be deleted through the UI.

Start the backend and frontend in two terminals, each in the repository folder:

```sh
npm run dev --prefix server
```

```sh
npm run dev --prefix hrm-client -- --strictPort
```

Sign in as the owner. Open **People & Access** from Apps. If the database has not been migrated, the API stops privileged access and reports that migration 004 is required.

## Owner setup

1. Select a person. Enable their personal apps and management actions. View is required for every management action.
2. Creating employees requires **All employees** scope. Payroll/Finance also require the Salary field permission. Choose **Own records**, **Selected employees** or **All employees**. This scope applies to employee-linked records; organization-wide catalogs such as positions and recruitment openings are shared within their granted app.
3. Grant confidential salary, bank and identity fields only where needed. These switches govern structured fields. Granting Documents also permits reading documents/files in that person's scope; the system does not redact text inside PDF attachments.
4. Save access. Changes are checked on every API request. Open browser sessions refresh their app catalog on focus and every 30 seconds; changed access clears cached queries.
5. **Copy access from** copies a non-owner's permissions into an unsaved draft. Review the selected employee scope before saving.
6. Open **Approval Setup**. Assign each form stage to a person with that app's approve/pay permission. The same person may own several stages; each stage still requires a separate decision.
7. Assign an alternate for requests submitted by the normal approver. Self-approval is refused. Preview with a chosen requester; this creates no real request or notification.
8. Activate Leave and Expense only after the route is ready. Existing requests retain their saved route and history; new submissions use the latest configuration.

## What is connected in this release

- **Leave:** migration 006 connects working calendars, half days, notice and certificate rules, conditions and PDF copies to Manager → HR final approval. Final approval locks and rechecks balances and deducts once. See [Leave setup](LEAVE.md).
- **Expense Claim:** the complete Expense Request form in My Rewards & Claims uses Department → AGM → COO → Finance payment, private quotations/receipts, business-unit/year request numbers and reference budgets. Each approving stage records its authorized amount and conditions. Currency is explicit. COO approval and actual final payment remain distinct. Finance records actual amount, currency, method, date and payment reference. Install migration 007; see [EXPENSES.md](EXPENSES.md). This records a payment; it does not move money.
- **Employee information:** connected by migration 005 with private documents and HR/final approval. See [Employee information](EMPLOYEE_INFORMATION.md).
- **Approvals:** requesters can follow their requests. Assigned approvers see only assigned requests for which they still have permission. The owner can inspect all. Decisions are checked against the current stage, current account, current permissions and version. Concurrent clicks cannot complete the same stage twice.
- **Probation:** migration 008 connects the complete evaluation, independent Manager → Department Head → HR decisions, private pre-decision self-assessment, legal-review attestations, final copies, receipt and written appeals. See [PROBATION.md](PROBATION.md).
- **Warning:** migration 009 connects the full letter, independent Warnings permissions, Supervisor → HR approval, private HR follow-up, employee comments/receipt and outside signed/refused records. See [WARNINGS.md](WARNINGS.md). Employee acknowledgment is separate from approval.
- Requests submitted before workflow activation keep their existing approval path. Configured requests cannot use old approve/reject endpoints or be deleted to bypass the route.

## Staff usage

Open **Approvals**. **Waiting for me** shows actionable stages; **My requests** shows requests you submitted. Open a request to review its details, attachment and history. Approve the current stage or reject with a reason. The Finance stage requires payment details. The next approver and requester receive an in-app notification.

## Access boundaries

- Only the owner can change permissions, configure workflows, manage accounts, view global audit logs and use the executive AI assistant. Global AI access is not delegated because its existing data sources span several apps.
- Non-owner legacy roles, JWT role claims and position names confer no authority. New employee accounts always start as employees.
- API route checks, employee-row filtering and confidential-field filtering enforce permissions in addition to launcher/page checks. Personal requests are always limited to the signed-in employee.
- No business data, password, attachment, live database or account setting is imported by this upgrade. Run migration 004 in the intended HR project before testing.

## Verification

The isolated PostgreSQL/API test covers fresh setup and upgrade preservation, restricted direct database access, owner settings, stale edits, role-spoof resistance, selected employees, protected fields, revoked permissions in existing sessions, disabled accounts, saved route snapshots, independent approvers, concurrent decisions, leave deduction timing and expense approval/payment separation. Real Supabase provisioning is performed in the target project using the migration above.
