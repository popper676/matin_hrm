# UYF HR operations — current unified organization model

The UYF HR system uses **one organization** with shared employees and a single account per employee. UYF, AI Autono, Wise Invest and other names are selectable **expense business tags**, not independent HR business memberships. Salary, employee scope and access policies are organization-wide. One employee/month has one consolidated payroll record, enforced by a database unique index; no business cost-sharing or salary allocation percentages are used.

## Owner operations

- In **Owner setup**, review branding, Expense business tags, employees/accounts, permissions, reviewer routing, leave calendar and payroll policy. Review status is not automatically marked complete.
- In **Expense business tags** (previously called Business setup), add, rename, activate or archive expense labels. Codes remain stable and historical requests retain their submitted tag and name. Business tags do not assign users, salary or permissions.
- In **People & Access**, the Owner selects module actions, field sensitivity and employee scope. A CEO/AGM/Finance job title alone does not confer Owner privileges.
- Expense routing uses the original requested amount and currency to select AGM → Finance or AGM → CEO → Finance, with independent alternates as configured. Approval and payment are distinct.
- Reminder settings are off unless the Owner deliberately enables them. Review preview before enabling; follow-ups and notifications use deduplication.
- Employee 360 shows accessible employee details, HR records and one payroll per month. Historical membership assignment records remain stored but cannot be newly assigned.

## Today and Monthly review

**Today** includes role-scoped reminders for assigned approvals, incomplete employee records, leave/probation/document follow-ups, relevant payroll deadlines and approved-unpaid expenses. Filtering business context only affects expense-related views.

**Monthly review** compares organization-wide salary totals with the prior month, employee-by-employee changes, missing payroll, explanations, and paid/pending totals. There is no business salary filter or cost-share attribution. Expense requests are separately filterable by expense business tag, currency, date, paid/unpaid state and receipt evidence. Request amounts are grouped by expense date; payments by actual payment date. Multi-currency amounts are not automatically converted or combined.

**Expense evidence** is human-reviewed. A submitted quotation is not automatically a receipt. Authorized people may append verified private evidence and outside receipt references. A specific assigned Finance reviewer with Pay permission can record receipt evidence even if the employee is outside their general employee scope.

## Deployment and safety

For existing installations already through migration 019, apply only migration `020_expense_evidence_access.sql` to update dynamic Finance receipt permission. Preserve active demo employees, payroll, expenses, approvals and login accounts. Do not rerun 001 or seed/migrations in bulk to resume testing. System automation and CI verification do not replace manual Owner and Employee tests.

Earlier cost-allocation/assignment instructions in the pre-MOD-002 manual are historical and must not be used as current instructions.
