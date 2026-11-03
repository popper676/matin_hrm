# Combined HR acceptance checks

All five approved forms are connected: Employee Information (005), Leave (006), Expense (007), Probation (008), Warning Letter (009). Automated tests use synthetic records. Manual verification on the user's installed Supabase project is still required before operational use.

Use a dedicated test employee, Owner, and independent reviewers. Keep test data clearly identified. Configure Owner-selected apps, employee scope, sensitive fields and Approval Setup assignments first.

1. **Access:** sign in as Owner, preparer, reviewer and employee. Check Apps visibility, direct URLs and selected employee scope. Revoke a permission while the user's session remains open; reload and confirm access is removed.
2. **Employee information:** submit personal details and a private attachment. Complete HR and authorized approval. Verify the employee can see their own form and restricted fields/documents remain protected.
3. **Leave:** configure working hours/calendar, leave types and entitlements. Submit a half-day request. Complete Manager and HR approval, including a conditional request; acknowledge conditions and compare the calendar/balance/PDF.
4. **Expense:** submit an expense with quotation/receipt, business unit and currency. Complete Department → AGM → COO → Finance. Compare requested, approved and actual paid amounts and payment reference. A request is not marked paid before Finance records settlement.
5. **Probation:** set hire date and personal Probation access. Prepare ten ratings, invite the employee, save their response, then complete Manager → Department Head → HR. Check the final PDF, separate receipt and written appeal. Verify an extension beyond the original cap fails and termination cannot be released without completed HR/legal review records. Employment/payroll changes remain separately controlled.
6. **Warning:** prepare and submit a letter, complete Supervisor then HR approval, and verify it is hidden from the employee before issuance. Add employee comments expressing disagreement, then acknowledge receipt separately. Confirm private HR notes remain hidden. Add an HR follow-up and an outside refused-signature record; neither overwrites the issued warning or creates an employee signature.
7. **Mobile/language:** inspect both portals in English/Myanmar and light/dark mode. Download each finalized PDF. Try a second click/stale tab on a completed decision; it must not record another approval.

Retain the observed result and any error text for each flow. Browser fixture checks do not provision the user's live Supabase database, calendar, storage or reviewer assignments.
