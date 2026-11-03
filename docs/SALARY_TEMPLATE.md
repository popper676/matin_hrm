# Salary template and Back navigation

The Payroll app now opens the monthly salary schedule based on the uploaded **Salary Template.xlsx**. The 23 A–W columns are preserved. The source workbook's example employee names, IDs, dates and entered SSB amount are not imported into the database or committed as company records.

## Update the existing installation

1. Stop both development terminals with Control+C and run `git pull --ff-only origin main` in the existing repository.
2. After migration 013, run **supabase/014_salary_template.sql** in the existing HR project's Supabase SQL Editor. On Mac, `pbcopy < supabase/014_salary_template.sql` copies it. This additive, rerunnable migration preserves old payrolls and employee salaries.
3. Restart `npm run dev --prefix server` and `npm run dev --prefix hrm-client` in separate terminals. No dependency installation is needed for this update.
4. Open Payroll, select a month and employee, then Prepare salary. Review the amounts and save as Pending. Edit requires scoped Payroll Edit; creation requires scoped Payroll Create. Salary access is required. Payment is a separate Payroll Pay action.

## Calculation and data meaning

Amounts are THB and are rounded to two decimal places. The salary period is the selected calendar month. For this template, inputs are reviewed by the payroll preparer; OT and unpaid days are not silently inferred from attendance or imported from the uploaded examples.

| Column | Behavior |
| --- | --- |
| A–D | Employee ID, Name, Department and Join Date come from the authorized employee record and are saved with the salary snapshot. |
| E, F, G | Basic Salary + Fixed Allowance = Total Salary. Basic Salary initially copies the current recorded salary; editing the payroll amount does not change that employee's salary record. |
| H | Calendar days minus Unpaid Leave Day (S). The source incorrectly referenced the monetary Unpaid Leave column T; the reference is corrected. |
| I | Basic Salary ÷ calendar days × Attendance Day. This is the uploaded template's informational attendance preview, not a second deduction from net salary. |
| J, K | Reviewed OT hours; OT Amount = Basic Salary × 12 ÷ (52 × 48) × OT hours × 2, rounded to two decimals, following the supplied formula. |
| L, M | Reviewed Special and Scarcity allowances. |
| N | Gross Salary = Total Salary + OT Amount + Special Allowance + Scarcity Allowance. The source had no gross formula. |
| O–R | Reviewed manual Employee SSB, Employer SSB, Income Tax and Staff Loan deduction amounts. No statutory rate or tax exemption is inferred from the uploaded footnote. Employer SSB is shown as an employer cost and is excluded from employee deductions. |
| S, T | Reviewed unpaid days in half-day increments; Unpaid Leave = Total Salary ÷ 30 × unpaid days, following the supplied formula. This template's divisor 30 does not rewrite the legacy payroll policy. |
| U–W | Total Deduction = Employee SSB + Income Tax + Staff Loan + Unpaid Leave + Other Deduction. Net Salary = Gross Salary − Total Deduction. Unpaid leave is deducted once. Saving a negative net salary requires correcting the inputs first. |

The old title said September while the period dates were October. New titles, period dates and calendar-day counts consistently use the selected month. SSB/tax/loan amounts are manual entries, not statutory advice, tax filing, automatic loan repayments or bank transfers. No KPI bonus is automatically added to this template; include an authorized additional payment explicitly in the appropriate allowance input. Existing KPI/workspace calculations remain available under Saved payroll & settings.

## Saved records, Excel and payslips

There is one payroll per employee/month. A historical payroll cannot be silently converted or overwritten by the template. The existing record remains under **Saved payroll & settings**. New snapshots retain their inputs, employee identity, calculation totals, notes and version. Both drafts and payment actions reject stale versions. Paid payroll remains immutable.

The 23-column salary table scrolls horizontally on smaller screens. Export salary Excel includes only saved template rows for the selected month, numeric/date cells, corrected row formulas, period dates and totals. It excludes unsaved form edits and historical rows using a different calculation. Employee Payslips shows the saved breakdown and Pending/Paid status. PDF downloads use the current company brand and enforce own Payslips access or scoped Payroll + Salary access. Historical payslips use their saved Basic Salary, Allowances, Bonus, Deductions and Net Salary without recalculation.

## Back button

Inner management and employee pages show a visible Back button. It returns to the previous known, currently permitted page in the same signed-in app session. Direct links and reloads without a known previous app page return to the appropriate Apps Home. Login/public pages and revoked permissions are not Back targets. Apps Home retains its existing navigation.

## Verification

Isolated SQL/API tests exercise formula reconciliation, zero and half-day values, leap-year periods, unknown/invalid inputs, version conflicts, current permissions and scope, immutable paid records, preserved historical amounts, migration reruns, numeric Excel/formula exports and own/foreign PDF access. Browser checks cover salary entry, save/edit/payment, horizontal scrolling, payslip breakdown and Back navigation on desktop/mobile in English/Myanmar. Manual acceptance on the actual Supabase project remains separate.
