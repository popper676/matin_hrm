# Medium-priority audit fixes

This update addresses the remaining 17 medium-priority findings against the current HR source. It preserves the existing users, employee records, submitted forms, payroll and business settings. The requested visual redesign remains a separate discussion.

| Finding | Result |
| --- | --- |
| F07 | Access and refresh tokens share a revocable database session. Logout revokes that session. Password changes/resets and account disabling revoke all existing sessions. Session creation checks the same password hash under a row lock, so an old login attempt cannot reopen a reset account. |
| F08 | `/auth/me` participates in silent renewal. Concurrent requests share one refresh and retry once; temporary refresh outages do not discard the account. Stale account-refresh responses cannot replace a newer login. |
| F09 | Personal OT requests use the signed-in employee and cannot forge a manager origin. Assigning OT requires Attendance Edit and scope; the assigned employee accepts/declines it. Employee requests require an independent Attendance Approve reviewer. Terminal decisions cannot be reversed through the status endpoint, including concurrent stale submissions. |
| F10 | Photo check-in/out validates bounded PNG/JPEG content, stores the evidence in private storage and records the appropriate proof URL. Opening evidence checks own attendance access or current scoped Attendance View. Camera evidence is retained; no facial identity verification is claimed. |
| F12 | An unpaid leave override such as `0.5` stays `0.5` in the payroll workspace. |
| F14 | Payroll, performance, SOP reporting, peer month uniqueness and AI timestamp queries use Bangkok boundaries with an exclusive next-month end. SOPs use their assigned date; legacy missing dates are filled from the existing Bangkok creation date. |
| F15 | Operational notifications follow current capabilities and employee scope instead of a legacy job title. Shared messages have separate per-account read/dismiss receipts. A personal notification cannot be read or dismissed by another account, including Owner. Historical management-wide messages without an employee association require All employees scope. |
| F16 | Interview email must be accepted by SMTP before the candidate becomes Interview. Failure preserves the original stage. If email succeeds but the stage cannot be saved, the response explicitly reports the sent email and requests a manual stage review without resending. |
| F17 | Personal-only voters receive a minimal active colleague list without broader employee access. An atomic database operation enforces the voter identity, valid score, active nominee, no self-vote and one vote per colleague per Bangkok month. Dead duplicate peer handlers are removed. |
| F18 | Multipart parsing bounds file size, file count, field count and text fields before accumulating unbounded buffers. SOP evidence allows images/videos up to 50 MB; handover and document-vault files are limited to 10 MB. Errors return structured responses. |
| F24 | AI history uses the latest ten prior messages in chronological order. The current question is included once. |
| F25 | Login/password-change destinations, executive links, Manual editing and affected OT/document/timeline actions follow current Owner-assigned access. Legacy role labels no longer decide those capabilities. |
| F28 | The missing career-timeline POST endpoint now validates milestones, employee scope, Employee Edit and salary access. It records history without changing the actual salary or position. New disciplinary records remain in Warning Letters. |
| F29 | Generated letters use checked document downloads instead of Owner-only generic uploads. Delegated managers obey scope and salary permissions; employees may open their own issued documents with Documents access. Existing local generated files also use the checked download route. |
| F30 | New generated letters retain their input snapshot and render the saved approval status/signatures. They support Myanmar text, show zero salary correctly and default to THB instead of a hard-coded USD amount. Existing uploaded/historical PDFs are preserved as files. |
| F31 | Calculated OT uses the attendance check-in's logical shift date and the overlap of approved windows with actual work after the shift end. Day shifts cannot borrow yesterday's approval. The existing one-hour minimum remains. |
| F32 | Photo/QR checkout finds the previous night's open attendance instead of creating another check-in after midnight. A record older than 36 hours requires manager correction. Photo checkout updates the same record and retains checkout evidence. |

## Update the existing Mac installation

1. Stop the two running development terminals with **Control+C**.
2. In the existing repository folder, run `git pull --ff-only origin main`.
3. Copy `supabase/013_medium_priority.sql` into the **existing HR Supabase project's SQL Editor**, create a new query and Run. Apply migrations 001–012 first only if this is a genuinely new database; on an existing installation missing 012, apply 012 before 013. Never rerun the fresh schema or recreate Owner.
4. Start `npm run dev --prefix server` and `npm run dev --prefix hrm-client` in separate terminals.
5. Sign in again with the current account. Tokens issued before this update have no saved session and cannot be renewed. Existing passwords are unchanged.

No dependencies change in this update, so repeating `npm ci` is unnecessary for a working installation. Migration 013 is additive and rerunnable. It creates private `attendance_photos` storage (2 MB per PNG/JPEG), session storage and notification receipts, adds proof/snapshot fields, and normalizes only previously missing SOP dates. Do not expose these tables or storage publicly.

## Verification

Checks use isolated PostgreSQL/Supabase fixtures, synthetic accounts and a mocked SMTP/model transport. Coverage includes session revocation and concurrent refresh, OT permissions/transitions, night checkout/proof access, Bangkok month boundaries, peer voting with personal-only permissions, notification isolation, milestones, bounded uploads and generated signed PDF content. Existing backend, payroll, browser, production build and container checks remain in place. No live SMTP, AI service or production database is used. User acceptance testing remains deferred.
