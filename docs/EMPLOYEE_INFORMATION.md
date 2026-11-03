# Employee information form

This step connects the approved employee information form to People & Access and the two-stage approval route: **HR review → Authorized approval**.

## Update an existing installation

1. Stop the API and frontend with Ctrl+C in their terminals.
2. In the project root, run `git pull --ff-only`. No new dependencies are required for this step.
3. Copy `supabase/005_employee_information.sql` into the **existing HR project's** Supabase SQL Editor and run it. On Mac: `pbcopy < supabase/005_employee_information.sql`. Do not rerun 001 or bootstrap the owner.
4. Restart the API with `npm run dev --prefix server` and the frontend in another terminal with `npm run dev --prefix hrm-client`.
5. As Owner, give the intended reviewers **Employees: View + Approve** and **Salary, Bank, Identity** confidential-field permission in People & Access. Reading a complete employee form requires all three. Assignment grants access to that particular submitted form even if it is outside the reviewer's general employee scope; it does not expand their other employee access.
6. Open Approval Setup → Employee information. Set HR review, Authorized approval and independent alternates. Preview and activate. Reviewers must be active accounts. An account linked to the subject employee cannot review their form.
7. Employees use My Profile → Employee information to save a draft, attach documents, sign the declaration and submit. HR uses Approvals. HR can also inspect scoped forms under Employees → employee profile. Manual testing may be deferred until the remaining forms upgrade is installed.

## Included fields and behavior

- Personal details, Thai name, identification and expiry dates, emergency contact, repeatable family members, education, experience, skills, languages and bank/payment details.
- Employment ID, department, position, supervisor, employment type, hire date, probation period, work location, status and recorded salary are read-only in the employee form. HR users with scoped Employees editing permission can set the probation-period and work-location metadata. Payroll amounts and effective dates retain their existing payroll controls.
- Eight document categories from the approved form. Actual uploaded documents determine the checklist; a note can explain missing documents. PDF/JPEG/PNG only, checked against file signatures, at most 10 MB each and 16 files per form.
- Files use a private bucket and short-lived download links. The new file routes check record access and the file category's confidential-field permission. Unknown/Other files require all confidential-field flags. Existing files are not made public. Storage signed URLs remain usable for their 60-second lifetime after issuance.
- Employees can see their own identity/bank data. Recorded salary and contract/Other downloads additionally require their Payslips personal app. Scoped management viewers see only their permitted confidential fields and document categories. Uploaded file contents are not text-redacted; permission to download a file permits reading its full contents.
- One draft or pending submission per employee. Submitted forms/files are immutable. HR and final approver identities, times and comments are retained. Rejected or approved submissions remain in history; a new update starts from the current approved profile. Attach fresh files to a new submission; prior attachments remain with the historical form.
- Draft saves and decisions reject stale versions. A final approval locks the employee record and checks that live contact information and the approved profile have not changed. A stale form must be rejected and resubmitted; it cannot overwrite newer HR edits.
- Only final approval applies approved personal/contact information and the separate verified profile. HR review alone never updates the live profile. Salary, position, employment status, username, role and app privileges cannot be requested or changed through this form. Account display names follow the approved employee name.
- The typed employee name records an authenticated declaration with a timestamp. HR actions record their authenticated accounts and timestamps. This does not add certificate-based digital signatures.

## Connected forms

Migration 006 connects the expanded [Leave form](LEAVE.md), 007 connects [Expense](EXPENSES.md), 008 connects [Probation](PROBATION.md), and 009 connects [Warning Letters](WARNINGS.md). All five approved forms are connected. See [combined acceptance checks](HR_ACCEPTANCE.md). Scheduled expiry notifications and document OCR remain outside these form integrations.

## Verification

The isolated PostgreSQL/API suite exercises actual routes, private file authorization, missing reviewer permissions, input restrictions, stale saves, declaration requirements, locked submissions, HR/final timing, concurrent final approval, protected salary, stale live-profile rejection, permission revocation and additive migration reruns. Browser checks fill/save/submit the actual React form and inspect the reviewer screen at desktop/mobile sizes, including Myanmar/dark mode. These fixtures never use real employee records or issue live HR approvals. Supabase SQL/Storage provisioning must be applied in the intended project above.
