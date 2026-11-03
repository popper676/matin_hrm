# Leave request form upgrade

This step connects the approved Leave Request Form to the existing owner-assigned **Manager → HR** approval route. New requests use working-calendar snapshots, decimal half days and authenticated employee declarations.

## Update the existing HR installation

1. Stop both running terminals with Ctrl+C.
2. In the project root run `git pull --ff-only`.
3. In the existing HR Supabase project's SQL Editor, run `supabase/006_leave_forms.sql`. On Mac, copy it with `pbcopy < supabase/006_leave_forms.sql`, paste into a new SQL query and Run. This requires migration 005; install 005 first if it has not been applied. Do not rerun the fresh-database migration or owner bootstrap.
4. Restart the API with `npm run dev --prefix server` and, in another terminal, the frontend with `npm run dev --prefix hrm-client`. This update uses existing dependencies.
5. As Owner, open **Approval Setup → Leave → Leave calendar & default hours**. Set the company's weekly off days and actual default shift hours. Add holiday/off-day or exceptional working dates. Save the calendar. Assigned employee shifts take priority over the default hours.
6. In **Leave → Types**, review each type's policy category and Paid/Unpaid setting. Known English labels are classified once by the migration; custom or Burmese labels need the owner's explicit category choice. The category determines Sick/Bereavement exceptions and certificate rules; the name alone does not grant an exception.
7. In **Leave → Balances → Set employee leave entitlement**, choose the employee, type, year and total entitlement. Existing balances are preserved. Allocate each applicable year for requests crossing New Year. This action requires scoped Leave editing permission; employees cannot allocate their own entitlement through the employee portal.
8. In People & Access grant the intended reviewers **Leave: View + Approve**. In Approval Setup assign Manager, HR and independent alternates, preview, then activate Leave. Assignment permits reviewing that particular request outside a reviewer's general employee scope.

Manual end-to-end testing may wait until the remaining forms are connected. Automated verification for this upgrade uses synthetic records.

## Employee flow

Open **My leaves → Request leave**. Employee ID, name, role and manager come from the employee record; enter the business unit and contact details for this request. Choose the configured leave type, dates, Full/AM/PM, reason and supporting file. Review the working dates and the **Before → Requested → Projected after** balance table. Accept the declaration, enter the signature name and submit.

- AM/PM is the first/second half of the scheduled shift. It uses one shift date and exactly **0.5 days**, including an overnight shift. The preview shows the actual Bangkok start time. Multi-date requests use full working days; separate half-day requests may cover opposite halves of one shift.
- The calendar applies **daily employee assignment → company date exception → dated weekly roster → company week**. A company holiday overrides the usual weekly roster; an explicit daily work assignment can override the holiday. Shift hours override company default hours.
- The notice policy follows the approved form literally: a range exceeding **3 consecutive calendar dates** requires submission by the date **7 working dates before** its requested start date. The cutoff is calculated backwards on that employee's working calendar; submission on the cutoff date is allowed. For ranges of 3 calendar dates or fewer, submit at least **24 hours before the scheduled leave start**, except Sick or Bereavement leave. The long-range rule also applies to long Sick/Bereavement requests.
- Sick leave exceeding **3 scheduled working days** needs an uploaded medical certificate and the employee's certificate declaration. Reviewers verify the document's contents; the software does not authenticate the doctor or extract a diagnosis.
- Paid leave requires sufficient entitlement in every affected year. Unpaid leave has no paid-leave balance cap; existing tracking rows record its usage. Pending requests do not deduct balances. Final HR approval rechecks current balances and deducts once, by calendar year. The final balance may differ from the earlier projected balance if another request was approved meanwhile.
- Overlapping pending/approved leave is refused. AM and PM do not overlap each other. A repeated submission with the same reference returns the original request, rather than creating a duplicate.
- PDF/JPEG/PNG files up to 10 MB are accepted after file-type checks. Files use a private bucket. Download and PDF endpoints require own, scoped or current assigned-reviewer access. A signed attachment link lasts 60 seconds.

## Review, conditions and records

Reviewers use **Approvals**. Each stage can Approve, Approve with conditions, or Reject with a reason. A Manager decision does not deduct leave. HR completes the final stage. Conditions from both stages are retained; employees can acknowledge them after approval in **My leaves → Form, decision & PDF**.

The submitted employee details, declaration, working dates, balance preview, decisions and final balance are retained. Employees and authorized reviewers can download the PDF at any stage; it identifies a pending/rejected/approved decision explicitly. Typed names and authenticated approval accounts are recorded with timestamps; this is not a certificate-based digital-signature service.

If the relevant working dates/hours or leave-type policy changes while approval is pending, final approval refuses the old snapshot. Reject it with an explanation and request a new submission. Changes to unrelated calendar dates do not invalidate a request. Approved snapshots continue to supply their original units to payroll.

Submitted forms and approval histories cannot be edited or deleted through legacy status/delete actions or bulk AI approval. Handover linkage remains available. A rejected request does not automatically mark attendance AWOL or add a payroll penalty. Reviewing actual AWOL is a separate human action under company policy.

## Payroll and existing records

New approved leave uses its frozen working-date units across months and years. Half-day presence receives the remaining shift fraction, and an approved unpaid half day still counts as **0.5 unpaid days** when the employee checks in for the other half. A check-in does not cancel approved leave. The monthly salary divisor continues to follow the configured payroll policy.

Earlier requests retain their existing approval route and calculation behavior. Existing staged requests remain in Approvals; existing unlinked requests can be reviewed through their legacy Leave controls. Older clients must use the updated form for new submissions. No new legacy request path bypasses the new form's validation.

## Verification

- Real Express/Supabase-client tests against isolated PostgreSQL: permissions, private files/PDFs, calendar and entitlement setup, old-client validation, half-day submissions, idempotent sends, overlap checks, conditions, final-only balance deduction, concurrent final approvals, acknowledgment and migration reruns.
- SQL policy tests: daily/holiday/roster precedence, overnight halves, 24-hour boundary, short Sick/Bereavement exemptions, long-leave notice cutoff, medical requirements, cross-year balances, calendar changes, transactional rollback and immutable records.
- Payroll regression checks plus fractional-unit, month/year and timezone cases.
- Browser checks: actual employee form preview/submission and conditional reviewer approval, desktop/mobile and English/Myanmar.
- PDF pages are rendered and visually inspected with English and Burmese synthetic data.

Supabase SQL/Storage provisioning must be applied in the intended HR project using the migration above. This release completes Leave. Complete Expense forms are connected by migration 007; see [EXPENSES.md](EXPENSES.md). Probation is connected by migration 008; see [PROBATION.md](PROBATION.md). Warning Letter is connected by migration 009; see [WARNINGS.md](WARNINGS.md).
