# Employee expense requests — MOD-004 and audit fixes

This is the current UYF HR expense workflow. Older instructions describing twelve mandatory fields, a requester-supplied reference budget, or mandatory four-stage review are historical and no longer apply to standard requests.

## Submission

Open **My Rewards & Claims → Request an expense**. Choose an active **Expense business tag**, expense category, purpose/description and amount. Currency defaults to **THB** but supports uppercase three-letter codes. The employee, department, request identifier and submission timestamp come from the authenticated account. Expense date defaults to today and is editable under Additional details; urgency defaults to Normal.

Conditional required fields:
- **Travel & Transportation:** destination and travel date.
- **AI Tools / Software**, **CRM** or **Cloud/Hosting:** service name; a subscription/billing period only for recurring charges.
- **Training / Events:** name; a scheduled date only if the user confirms a date.
- **Urgent / Critical:** reason and payment deadline.

The Procurement item's description supplies the item/service details; it is not a second justification. Vendor/payee and ordinary payment deadline are optional. Quotation, receipt and other supporting documents are **always optional**, regardless of amount, category or urgency (up to five PDF/JPEG/PNG files of at most 10 MB each when attached).

**Do not enter or request Budget Amount.** Projected Budget Remaining has been removed from new submissions. Historical form snapshots and their budget figures are preserved, but were never a company budget ledger.

## Review and payment

Amount-based routing uses the **original requested amount**, the configured per-currency AGM threshold and explicitly assigned independent reviewers. Within AGM threshold: **AGM → Finance**. Above threshold or no configured threshold: **AGM → CEO → Finance**. The optional older four-stage template may still exist for legacy submissions. Job title alone grants no authority; server-side app/action, sensitive-field and employee-scope rules apply.

Approval does not transfer funds. Finance records **actual payment** in a separate stage, including method, date, reference, currency and final amount. Subsequent receipt evidence can be appended by a permitted scoped Expense editor/payer or the **actual assigned Finance reviewer** with Pay permission, regardless of whether the route has two, three or four stages. Employee-submitted files are not automatically accepted as final receipts.

New submissions are validated again by the server and SQL function, and a repeated submission key with identical input is idempotent. Historical expense details, reviewers, comments, payment and private files remain intact.

## Installation and verification

For an existing installation already through migration 019, apply **only** `supabase/020_expense_evidence_access.sql` after reviewing and backing up the SQL function definition. It replaces the receipt-recording RPC without deleting any expense data. Do not rerun fresh-start migrations or seed/reset demo accounts.

CI and isolated automated tests are separate from Owner/Employee manual acceptance. In final verification test a no-attachment Office/Admin expense, Travel/Software conditional fields, urgent deadline, low/high amount routing, Finance receipt recording outside ordinary employee scope, payment state and PDF history. Never test with real bank transfers.
