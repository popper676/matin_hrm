# Full audit fixes — 21 October 2026

This release addresses the eight High, fifteen Medium and four Low findings in the 21 October audit. It adds migration **015_audit_integrity.sql** after 014. Existing employees, accounts, payrolls and issued documents are retained.

| ID | Result |
| --- | --- |
| H01 | SOP bulk deletion requires Delete, including server authorization. |
| H02 | Payroll workspace checks Create for a new employee/month and Edit for an existing month inside the locked transaction. Create-only users can open the workspace. |
| H03 | Salary changes, including older OTHER events with salary fields, have sensitive prose removed for readers without Salary access. New reductions use SALARY_CHANGE. |
| H04 | Approval checks the current handover version, submission state, required items and successor acknowledgments. Content changes clear acknowledgment and reopen submitted work. Completed/waived/cancelled handovers and their items/files are read-only. |
| H05 | Issued/reviewed document history and referenced vault records cannot be deleted. Deleting an unreferenced metadata record retains private storage bytes, so shared files stay available. |
| H06 | Legacy payroll preview and save share bonus/net arithmetic. Manual KPI input participates in both. Bonus is computed; unpaid leave remains a deduction. |
| H07 | Marking legacy payroll Paid changes status only, with a locked freshness check and audit entry. Monetary edits and payment must be separate requests. |
| H08 | Permanent deletion checks foreign keys and legacy UUID employee associations, including SOPs. Employees with retained history must be deactivated. |
| M01 | Attendance uses daily schedules, date exceptions, weekday/date-matching rosters and company days in the same order as Leave Calendar. SQL also accepts open-ended roster date ranges. Overnight early-departure calculations use the following day. |
| M02 | Exit interview/survey writes include employee_id; migration backfills missing links and rejects mismatched parents. |
| M03 | Manual SOP assignments receive a Bangkok assigned_date. Old NULL dates are backfilled from created_at. The portal shows every due assignment and overdue work, using assigned_date rather than creation time. |
| M04 | Text SOP reports have a real schema column, bounded input and a saved read view. |
| M05 | Nested handover reads use the actual authenticated request. Scoped View works without Edit. Only the actual successor acknowledges completed items. |
| M06 | KPI settings validate numbers, complete weights, manual metrics and total weight. Missing settings use explicit defaults; invalid saved data or read failures report an error instead of silently changing calculations. |
| M07 | Performance calculations use a narrow read-only source for the permitted employee and settings; source outages fail visibly. This does not grant access to raw attendance, leave or salary APIs. |
| M08 | Default personal voting works without an explicit access-policy row. An explicit policy that removes Voting still blocks voting. |
| M09 | QR attendance and token consumption commit together. Cooldown, stale attendance or other failures leave the token unused. |
| M10 | Finance shows employee, saved net_salary, THB and actual Pending/Paid status. No guessed MMK conversion. Month comparison uses the immediately preceding calendar month; no prior base displays an unavailable variance. |
| M11 | SOP/template/bulk and lifecycle writes inspect returned database errors. Lifecycle case, tasks, exit handover and initial notification creation are transactional. |
| M12 | Each bulk-import row atomically creates its employee, login and history. Username collisions roll back that row and appear in row errors. New random temporary passwords are returned once to the Owner and require a first-login change. Existing-row updates and username synchronization are also atomic. |
| M13 | Approval queries select the requester/assignee before paging, recheck current visibility, deduplicate and show pending work first. Older assigned requests survive unrelated newer activity. |
| M14 | Dashboard day counts use Bangkok calendar dates, including after UTC midnight boundaries. |
| M15 | Numeric salary zero is preserved; malformed/negative/non-finite salary values are rejected. |
| L01 | Birthday notifications deduplicate per employee, recipient, occurrence and reminder day in one transaction. The cron runs at 08:00 Asia/Bangkok. New Year is handled; February 29 is observed on February 28 in common years. |
| L02 | The 13 missing literal keys have EN/MM entries. Finance labels/statuses and import credentials are translated. The translator accepts an explicit defaultValue. CI checks literal keys and catalog structure parity. |
| L03 | Route pages load lazily behind Suspense. The initial JS bundle drops from approximately 2,787 kB to 608 kB before compression; large optional feature chunks remain. React Query invalidation calls use the v5 object API. |
| L04 | Recruitment/social captions prefer PUBLIC_APP_URL, with FRONTEND_URL and legacy APP_URL fallbacks. Invalid schemes/embedded credentials are rejected; production requires configuration. |

## Existing installation

1. Pull the updated main branch from the project root.
2. If not previously applied, run 013_medium_priority.sql and 014_salary_template.sql in order in the **existing HR Supabase project**.
3. Run supabase/015_audit_integrity.sql there. It is additive and rerunnable. Do not run 001_fresh_hr_schema.sql against an existing database.
4. Restart the API and frontend. Sign in again to load current access settings.
5. Keep PUBLIC_APP_URL set to the real frontend address used by applicants.

```sh
git pull --ff-only origin main
```

On macOS, copy the migration into the clipboard for Supabase SQL Editor:

```sh
pbcopy < supabase/015_audit_integrity.sql
```

Two running terminals, both in the project root:

```sh
npm run dev --prefix server
```

```sh
npm run dev --prefix hrm-client
```

No new dependency versions are introduced by this release. Existing correctly installed dependencies can be reused.

## Calculation and retention notes

Legacy payroll uses the existing canonical rule: `bonus = basic × target bonus % × KPI %`; `net = basic + allowances + bonus − deductions`, rounded by the engine. For example, 30,000 THB basic at 15% target and KPI 100 produces 4,500 bonus and 34,500 net before other adjustments. It no longer applies the old conflicting base-pay KPI penalty. The supplied 23-column Salary Template remains the primary payroll screen and keeps its own saved template calculation rules.

Paid payroll and completed handovers are retained. Corrections require a separate adjustment/new record. Legacy Leave records with linked terminal handover history should be retained rather than deleting that history. Private file bytes left by a metadata deletion require a future reference-aware storage-maintenance process; this release deliberately performs no automatic file purge.

SOPs with NULL assigned_date are dated using their stored creation time in Bangkok. If an old assignment was intended for another date, review its actual date before using historical performance reports. Existing invalid KPI settings must be corrected by the Owner before calculations resume. Attendance retains its historical 09:00–18:00 fallback when no hours exist; leave-duration quotes still require explicit shift/calendar hours.

The approval inbox pages matching requests instead of using a global 1,000-row cutoff. A matching source over 100,000 rows produces an explicit error; long-term archival/filtering remains an operational capacity improvement.

## Automated verification

- Existing backend and payroll-engine suite, including fresh schema/access restrictions and salary exports.
- 29 actual Express/Supabase/PostgreSQL audit regression scenarios in tests/audit-flow.js.
- Additional migration rerun/ACL, atomic import/lifecycle rollback, workspace permissions/stale writes, QR retry/consumption, calendar conformance, birthday boundaries, caption URL and translation tests.
- Source checks, frontend lint and production build.
- Chromium flows cover saved Finance amounts/status in EN/MM and desktop/mobile, the legacy manual-KPI preview, multiple due SOPs, future-date filtering and React Query refetch. Existing browser flows continue to cover both portals, salary exports, access controls and approved workflows.

These checks use isolated synthetic data. No live Supabase data or personal credentials are used. End-to-end acceptance on the user's own setup remains separate from automated verification.
