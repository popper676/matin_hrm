# High-priority audit fixes

This change addresses the 13 high-priority findings from the source audit of commit 1e5ec3e051cf76cae2339dc79753cf1ba326ca3d.

| Finding | Result |
| --- | --- |
| F01 | Both Docker stages include root shared modules. CI builds the production image, imports backend routes and renders a PDF with networking disabled. |
| F02 | Manual drafts, publishing, restoration, API reads and browser rendering use HTML allowlists. Manual and AI PDF rendering disable scripts and external requests. |
| F03 | Manual attendance and manual checkout require Attendance Edit. Photo check-in is restricted to the signed-in employee. |
| F04 | Payroll uses the saved salary divisor unless a valid explicit override is supplied. |
| F05 | Zero salary, zero override and zero bonus percentage remain zero. Missing salary defaults to zero. |
| F06 | A database trigger prevents updates, reversals and deletion of Paid payroll, including stale concurrent requests. Performance sync skips Paid rows and changes bonus/net atomically. |
| F13 | Candidate conversion locks the candidate and creates employee, basic employee login and audit entry together. Retrying returns the existing employee; it does not reset the password. Delegated conversion requires Recruitment Create and All employees scope. |
| F19 | Document signing enforces Boss approval before HR issue, records the actor/history and creates one issued document across retries. Older vault-fallback approval requests are preserved. |
| F20 | Permanent deletion is transactional and limited to unused records. Any retained HR history or assignments block deletion; use deactivate for former employees. |
| F21 | Settlement release requires Offboarding Approve, completed clearance tasks and completed/waived handover. Generic updates cannot release settlement. |
| F22 | AI write tools only create ten-minute proposals. The Owner reviews the immutable payload in a card and explicitly confirms or cancels. Confirmation checks current Owner access and session, and executes each proposal once. Official warnings and leave decisions remain in their approval workflows. |
| F26 | Both apps use official SheetJS 0.20.3 with a locked checksum, replacing vulnerable npm xlsx 0.18.5. |
| F27 | A narrow read-only calculation adapter checks Payroll, Salary and employee scope before reading attendance, leave, SOP and peer inputs. It grants no raw module access. |

## Update an existing installation

1. Back up the existing Supabase database.
2. Run `supabase/012_high_priority_integrity.sql` in that same project's SQL Editor, after migrations 001–011 are present. Do not rerun the fresh-start migration.
3. Pull the reviewed branch/merged main, run `npm ci --prefix server` and `npm ci --prefix hrm-client`, then restart both terminals. For containers, rebuild the image.
4. Keep the existing environment values, instance ID, users and business records.

Migration 012 is additive and rerunnable. It does not reset users, payroll, leave balances or business settings. Existing Paid payroll becomes immutable immediately; corrections need a separately documented adjustment rather than rewriting a receipt.

Manual content supports paragraphs, headings, lists, tables, safe links and emphasis. Embedded scripts, inline styles, images and frames are removed. Existing stored content is sanitized when read without rewriting its historical source.

Owner AI alerts are informational. They do not create disciplinary decisions. Confirmed actions attempt their informational Telegram delivery when configured; delivery is not automatically retried, to avoid duplicate alerts.

## Verification

Automated checks run against isolated PostgreSQL/Supabase protocol fixtures and synthetic browser accounts. No production database or live email, Telegram or AI service is used. The workflow also builds the actual Docker image and checks Chromium offline. See the PR checks for the final run and totals.
