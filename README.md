# Unlock Your Future HR Management

An HR-only application for Unlock Your Future, with a fresh database setup and no imported accounts or business records.

## Included

Employee records, departments, positions, organization chart, attendance (photo/QR/biometric), shifts and rosters, leave and overtime, payroll and configurable policies, rewards and claims, recruitment and careers, onboarding/offboarding, handovers, performance/KPIs, HR documents, SOPs, announcements, peer feedback, birthdays, audit logs, user administration, and employee self-service. The optional Gemini assistant can query only allowlisted HR tables and proposes HR actions for explicit Owner confirmation. Optional recruiting email/Facebook announcements remain part of recruitment.

## Removed

Customer CRM and inbox, sales/leads, meal packages and customer forms, kitchen/menu/order workflows, delivery/riders, inventory, customer AI copilot, customer and kitchen scheduled jobs, and associated UI, API, dependencies, uploads, seeds and repair scripts. Old auto-merge/deployment workflows and former server/image/domain configuration are removed.

## Fresh start

Follow [the Burmese setup guide](docs/FRESH_START.md).

1. Create a **new** Supabase project; never reuse the client's database or `.env`.
2. Run `supabase/001_fresh_hr_schema.sql` once in its SQL Editor, then `supabase/002_private_hr_storage.sql`, then `supabase/003_recruitment_openings.sql`, then `supabase/004_people_access_approvals.sql`, then `supabase/005_employee_information.sql`, then `supabase/006_leave_forms.sql`, then `supabase/007_expense_forms.sql`, then `supabase/008_probation_forms.sql`, then `supabase/009_warning_forms.sql`, then `supabase/010_hr_operations.sql`, then `supabase/011_branding_owner_setup.sql`, then `supabase/012_high_priority_integrity.sql`, then `supabase/013_medium_priority.sql`, then `supabase/014_salary_template.sql`, then `supabase/015_audit_integrity.sql`, then `supabase/016_hr_completion.sql`.
3. Copy `server/.env.example` to `server/.env` and configure new project credentials, project reference, returned instance ID, and a new JWT secret.
4. With Node.js 24, install dependencies using `npm ci --prefix server` and `npm ci --prefix hrm-client`.
5. Run `npm run setup:owner --prefix server` interactively to create your own owner account. There is no seeded/default account.
6. Run `npm run dev --prefix server` and `npm run dev --prefix hrm-client` in separate terminals. Open `http://localhost:5173`.

Schema setup refuses an existing public application schema. Runtime and owner setup verify the project reference and HR instance marker before serving requests or starting jobs. The owner bootstrap is one-time and refuses existing users/employees. HR buckets are private; attachment links go through authenticated routes and short-lived signed URLs.

The schema contains no employees, accounts, customer records, passwords, attendance, leave, payroll, chat history or imported documents. The single instance marker is setup metadata. Payroll settings use documented code defaults until you configure them; no former company's policy row is imported.

## Verification

```bash
npm run check
npm test
npm run build
```

Tests use an isolated PostgreSQL engine (PGlite), including the real Express routes and Supabase client through a test PostgREST adapter. They cover clean schema creation, refusal of existing databases, one-time owner setup, fresh-instance guards, HR AI data restrictions, empty HR dashboards, employee provisioning, forced password change, attendance, leave approval, payroll, and lifecycle records. Payroll calculation regression tests are retained. These checks do not establish real Supabase Storage/PostgREST provisioning or live Gemini, email, social or camera-device operation; validate those against the new project before production.

## Deployment

For a VPS serving HTTPS on **port 5896**, follow [VPS deployment instructions](docs/VPS_DEPLOYMENT.md) and use `nginx/hrm-5896.conf`.

CI only checks source, tests, and build. It does not deploy. `docker compose up --build` uses the local source and a dedicated volume, and binds `127.0.0.1:8081`. `nginx/hrm.conf` is a template for a new hostname. Configure HTTPS and backups separately. Do not copy the former production config.

## Data and Git history

This change removes inherited data-bearing files, keys and scripts from the current source. It does **not** delete data in the original client's Supabase project or rewrite old Git commits. Previously committed credentials must still be revoked/rotated at their provider; deleting their current file does not revoke them.

## Recruitment upgrade

Existing UYF instances: apply only `supabase/003_recruitment_openings.sql` in their current HR project. Do not rerun the fresh-start schema. See [recruitment setup and usage](docs/RECRUITMENT.md). Job openings use private supporting files, explicit HR review/publishing, frozen application criteria, and advisory AI matching. PDF/DOCX/TXT extraction runs locally in a bounded worker; scanned or unreadable PDFs require manual entry.

## People, access and approval assignments

For the access foundation, apply `supabase/004_people_access_approvals.sql` if not already installed, followed by `005_employee_information.sql`. Existing installations with 004 need only 005. Sign in as the existing owner and configure People & Access, then Approval Setup. Non-owner management access is now explicitly granted by the owner, not inferred from job title. See [setup and release scope](docs/PEOPLE_ACCESS.md).

## Employee information form

Existing People & Access installations: apply **only** `supabase/005_employee_information.sql` after pulling this update. My Profile now supports drafts, private supporting files, an employee declaration and HR/final approval before profile changes take effect. See [update and workflow instructions](docs/EMPLOYEE_INFORMATION.md).

## Leave request form

Existing installations through 005: apply `supabase/006_leave_forms.sql` after pulling. Configure the Leave calendar, type categories, yearly entitlements and Manager/HR reviewers. New requests support half days, private certificates, notice rules, conditional approvals, immutable calendar snapshots and PDF copies. See [Leave setup and release scope](docs/LEAVE.md).

Expense form setup, private quotations/receipts and final Finance payments: [docs/EXPENSES.md](docs/EXPENSES.md).

Probation evaluations, employee comments, HR decisions and appeals: [docs/PROBATION.md](docs/PROBATION.md).

Warning letters and private HR follow-up: [docs/WARNINGS.md](docs/WARNINGS.md). All five approved forms are connected; [combined acceptance checks](docs/HR_ACCEPTANCE.md).

Today, in-app deadline reminders, Employee 360, expense business tags and consolidated monthly payroll/expense review: [docs/OPERATIONS.md](docs/OPERATIONS.md). For existing installations already through 019, apply only migration 020 for reviewer evidence permissions.

Shared branding, logo/color/email settings and the seven-step Owner setup guide: [docs/BRANDING_SETUP.md](docs/BRANDING_SETUP.md). Existing installations through 010 need only migration 011.

## Salary template and Back navigation

Payroll uses the supplied 23-column salary schedule with saved input snapshots, THB Excel export, checked payslip PDFs and separate payment recording. Existing installations through 013 need migration **014_salary_template.sql**. Inner portal pages include Back navigation with Apps Home fallback. See [setup and calculation rules](docs/SALARY_TEMPLATE.md).

The full 21 October audit fixes (High 8 / Medium 15 / Low 4) require migration **015_audit_integrity.sql** after 014. See [all changes, retention and installation steps](docs/FULL_AUDIT_FIXES.md).

Release 016 implements currency-based Expense routing, the shared portal UI, Owner setup readiness and searchable Owner/Employee guides. Apply **016_hr_completion.sql** after 015. See [implementation status and update steps](docs/IMPLEMENTATION_STATUS.md).

Optional client presentation dataset: see [Client demo setup and cleanup](docs/CLIENT_DEMO.md). Apply migration 017 after 016, then use the Owner-authenticated `demo:seed` command. The migration itself adds no demo users.
