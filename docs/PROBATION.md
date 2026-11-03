# Probation evaluation

This upgrade connects the approved five-page Probation Evaluation form to the Owner-assigned **Manager → Department Head → HR** route. It records human assessments and decisions. Competency ratings do not select an employment outcome.

## Install in the existing HR project

1. Stop both terminals with Ctrl+C and run `git pull --ff-only` from the project root.
2. After migration 007, run `supabase/008_probation_forms.sql` in the existing HR Supabase project's SQL Editor. On Mac: `pbcopy < supabase/008_probation_forms.sql`, paste into a new query and Run. It preserves existing HR records.
3. Restart `npm run dev --prefix server` and, in another terminal, `npm run dev --prefix hrm-client`. No new dependencies are required.
4. In People & Access grant evaluators **Probation: View + Create + Edit**, the intended employee scope, and **Approve** when they also review. Reviewers require **Probation: View + Approve**. Performance-tracker access does not grant Probation access. Enable the personal **Probation** app for employees who will be evaluated. Existing explicit personal-app selections are preserved; the new app is not silently added to them.
5. Set the employee's hire date in Employees. Configure the working calendar and actual default hours in Approval Setup → Leave. The same calendar, dated exceptions and employee rosters determine five/ten-working-day deadlines.
6. In Approval Setup → Probation assign Manager, Department Head, HR and independent alternates, preview for the employee being evaluated, then activate. A job title does not grant access. A manager may sign an evaluation they authored for another employee; the subject employee cannot author or approve their own evaluation.

Manual user testing can wait until the remaining forms are connected. Automated verification uses synthetic records.

## Prepare and submit

Open the **Probation** app in the management launcher. Create an evaluation for an employee in the evaluator's scope. Save drafts while entering the original period, verified attendance counts, ten 1–5 competency ratings and comments, up to five goals/targets/results, training, strengths, improvements, overall performance/cultural-fit/growth assessments, and the manager's recommendation.

Names, employee number, hire date, department, job and manager are captured from the employee record. The approval route records the assigned HR representative. Attendance counts are entered and verified by the evaluator; the form does not infer unexcused absence or apply an attendance/payroll penalty.

Three/six-month periods start at the hire date and end one day before the corresponding calendar anniversary. A custom period uses the entered original end date. The original period freezes once the employee is invited. The app records the original and current end dates and the maximum extension date.

**Invite employee** requires a future response deadline and an active linked employee account with personal Probation access. The employee sees their period and the three self-assessment questions. They may submit comments and a typed signature, or explicitly decline comments and sign that choice. Choosing decline discards unsubmitted comment text. Manager ratings, recommendations and draft HR/legal/salary information are withheld from the subject until the final decision.

After completing the form and sending the invitation, submit for the three human reviews. Submission freezes the evaluation. Employee responses are recorded independently and can arrive while review is pending. A reviewer can return the evaluation with a required reason; the record remains retained and a corrected evaluation can be prepared.

## Policy handling

- **Two-week timing:** the due date is 14 calendar days before the current probation end. Late submissions and late HR decisions require explanations and are visibly flagged. A late record is retained as late, rather than treated as timely or made impossible to document.
- **Employee opportunity:** HR cannot finalize before a response or explicit decline. After the full response-deadline date has elapsed, HR may record that the opportunity was offered and document no response. This is an authenticated human attestation.
- **Extension limit:** a six-month period allows at most three calendar months beyond the original end. For a three-month period, half the calendar-month interval is one calendar month plus fifteen days. Custom periods allow half their calendar days, rounded down. These date conventions are explicit. Later reviews inherit the original cap and the previous extended end, so another evaluation cannot restart the allowance. Extension recommendations and final decisions both require a new end date, reason and new goals.
- **Termination:** the HR stage must record completed HR/legal review, the legal reviewer's name, date and reference before the termination outcome and final form are released. The system records the HR reviewer's attestation; it does not perform legal review. Internal legal references are available only to the Owner/current assigned HR reviewer, and are excluded from the employee copy.
- **Benefits:** a confirmed outcome records full benefits from the confirmation effective date. The date must match the benefits activation date.
- **Employment and salary:** the form records the approved outcome, benefits date, HR notes, salary adjustment and whether HR updated employment records separately. These fields do not change `Employees`, deactivate accounts or mutate payroll. Salary adjustments require the Salary field permission and are redacted from viewers without it. An employee's own salary adjustment is visible only with personal Payslips access. Use the existing Employees/Payroll tools with the appropriate permissions for actual record changes. A “status updated” attestation requires a reference.

## Final copy, receipt and appeal

HR explicitly chooses Confirmed, Extended or Terminated. At final approval the completed form and PDF are released immediately in the employee's Probation portal and a notification is recorded. The five-working-day sharing deadline and ten-working-day appeal deadline are captured using the employee's configured calendar. Later calendar changes do not silently move those recorded deadlines.

The employee can acknowledge receipt without agreeing to the outcome, and may submit a signed written appeal by the appeal deadline. HR/Owner can also record a signed letter/email received outside the portal, including after an account has been closed. That record requires an actual received date within the original appeal window, a source reference, the employee's signed name and the HR recorder's attestation. The actual entry timestamp and recorder are retained separately.

The assigned HR reviewer or Owner can append a written appeal response. The original decision remains immutable; an appeal response does not silently rewrite an employment outcome or employee/payroll record. All evaluations, authenticated approval timestamps, signatures, responses and appeals remain linked to the employee's personnel record.

## Access and validation

Dedicated API checks enforce employee scope, assigned-reviewer permission, current account activity, personal-app visibility and salary/legal redaction on JSON and PDFs. Pending employee projections contain only the invitation/period/self-assessment fields. A direct URL does not reveal pending ratings or recommendations. Revoking permission closes subsequent access or decisions.

Version checks prevent stale tabs from overwriting drafts, employee responses or decisions. Only one draft/pending evaluation per employee is allowed. Submitted records and intermediate approval histories reject legacy writes and deletion. Changes to workflow settings affect new submissions; existing requests retain their saved route.

Verification includes real Express/API tests against isolated PostgreSQL, independent-review and self-review checks, extension caps across rounds, legal-release gates, no-response opportunity gates, field redaction, private PDF access, receipt/appeal handling, migration reruns, unchanged employment/payroll records, and browser checks of the actual form and review flows. Generated English/Myanmar PDFs are rendered and visually inspected.

This completes Probation Evaluation. Warning Letter is connected by migration 009; see [WARNINGS.md](WARNINGS.md). All five forms are connected; see [combined acceptance checks](HR_ACCEPTANCE.md).
