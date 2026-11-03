# Warning letters

Migration 009 connects the approved Warning Letter form to **Supervisor / Manager → HR / Authorized Approver**. The Owner assigns people and permissions; a job title does not grant access. A preparer may approve a letter they wrote for another employee when assigned. The subject cannot prepare or approve their own warning. If the subject is assigned, an independent alternate is required.

## Update the existing installation

1. Stop the server and frontend terminals with Ctrl+C. From the project root, run `git pull --ff-only`.
2. After migration 008, run `supabase/009_warning_forms.sql` in the existing HR Supabase project's SQL Editor. On Mac, `pbcopy < supabase/009_warning_forms.sql`, paste into a new query and Run. Do not rerun migration 001. No new dependencies are required.
3. Restart `npm run dev --prefix server` and `npm run dev --prefix hrm-client` in separate terminals.
4. People & Access: grant **Warnings: View + Create + Edit** to preparers and **View + Approve** to reviewers, with the intended employee scope. Enable the personal **Warnings** app for employees who should receive letters in their portal. Existing explicit personal-app choices remain unchanged.
5. Approval Setup → Warning: assign Supervisor and HR, independent alternates, preview, then activate. The same person can fill both stages if the Owner chooses; they must be independent of the subject. Two separate decisions are still recorded.

## Prepare and review

Open Warning Letters from Apps. Save drafts with employee details, letter date, manually selected First/Second/Final level, incident date/time/location, one or more of the eight categories, factual description, policy/SOP, previous counseling/warning and date, corrective expectations and target/review date. Dates are Bangkok calendar dates. Incident cannot follow the letter date; review cannot precede it. Drafts may be incomplete; submission requires the complete form.

Submission freezes the form and assigns a unique annual number, `UYF-WARN-YYYY-NNNNN`, transactionally. A returned letter remains retained with the reason; prepare a corrected letter as a new record. The system does not infer guilt, increase warning level, terminate employment, change payroll or deactivate accounts.

Both reviewers decide from Approvals or the Warning Letters app. HR records the actual date the employee was informed, an explanation/opportunity-to-comment record, and a required private HR file reference and follow-up date. HR attests that the explanation/opportunity happened; this is not an employee signature. Authenticated review actions retain the actor, time and comments as Supervisor/HR signatures.

Portal delivery requires an active linked account with personal Warnings access. HR final approval releases the letter/PDF immediately and records a notification. Outside delivery is also supported: HR records a completed delivery date and evidence reference, so a letter can be retained for someone without an active portal account. No email or external message is sent by this feature.

## Employee comments and acknowledgment

Draft/pending letters are withheld from the subject, including direct record and PDF URLs. After issuance, employees with personal Warnings access can read their own letter and download its PDF. The employee may save comments without signing receipt, and may acknowledge separately later. Acknowledgment requires the employee's signed name and explicit confirmations that the warning was explained, corrective expectations understood, and an opportunity to comment provided. Receipt does not imply agreement. Existing comments and signatures cannot be overwritten.

HR may transcribe a signed paper or record a refused/unavailable signature with actual date, source evidence and recorder attestation. These entries are marked as HR-recorded, not as authenticated employee signatures. Refusal/unavailability does not produce an acknowledgment. External records and later employee portal responses remain separate and retained.

The approved Warning Letter does not define a separate appeal process or deadline. Its employee comments/response are implemented; Probation's appeal rules are not applied to Warning Letters.

## Private HR follow-up and retained history

Owner/current assigned HR reviewer can append private file references, follow-up dates and notes. Other managers and employees cannot see these internal HR records in JSON or PDFs. Every entry has its recorder and timestamp. The issued warning, original approval history, employee comments, receipt and outside records remain retained; follow-up does not rewrite the warning.

Warnings has independent permissions from Documents and Probation. New warning creation through the old generic Documents request screen is redirected to this workflow. Existing archived document records remain available through their prior access controls.

Current account activity, employee scope and assigned-reviewer permission are checked on every request/action. Revocation closes later access. Version checks and row locks prevent stale/concurrent decisions and duplicate issuance. RLS, service-only RPCs and write guards prevent direct browser writes and legacy approval/deletion bypasses. Migration 009 can be rerun without clearing existing records.

Automated verification covers validation, numbering, both review stages, own-warning restrictions, alternates, permission revocation, legacy write rejection, private JSON/PDF copies, separate comments/receipt, outside delivery/refusal, append-only HR records, concurrency, migration reruns and unchanged employee/payroll data. Browser checks exercise the actual forms in English/Myanmar, desktop/mobile and light/dark modes. All five approved forms are now connected; see [combined acceptance checks](HR_ACCEPTANCE.md).
