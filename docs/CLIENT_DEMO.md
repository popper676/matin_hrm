# Client presentation data / သရုပ်ပြ data

This optional installer adds fictional records to the existing HR instance. It never changes an Owner password, creates an Owner, sends email, calls an AI service, or marks a real payment as sent. A demo-labelled payment is sample history only.

## Install on your Mac

လုပ်နေသော Terminal နှစ်ခုလုံးတွင် `Control + C` ဖြင့် server များကို ရပ်ပါ။ Project folder ထဲက Terminal တွင်:

```sh
git pull --ff-only origin main
npm ci --prefix server
npm ci --prefix hrm-client
```

Existing HR Supabase project → SQL Editor → New query. After migrations 003–016 have already been applied, install `supabase/017_client_demo.sql` followed by `supabase/018_demo_safe_updates.sql`. This migration itself inserts no employees or demo accounts. Do not rerun 001; do not create another Supabase project or change your existing `.env`.

Mac တွင် SQL ကို clipboard ထဲ ကူးရန်:

```sh
pbcopy < supabase/017_client_demo.sql
```

Paste into SQL Editor and click Run. Apply `018_demo_safe_updates.sql` next for existing Supabase safety-guard compatibility. Then return to your project Terminal:

```sh
npm run demo:seed --prefix server
```

မူလ Owner username နှင့် password ကို ထည့်ပါ။ Password ရိုက်နေစဉ် စာလုံးမပေါ်ခြင်းသည် ပုံမှန်ဖြစ်သည်။ Login details ကို Chat ထဲ မပို့ပါနှင့်။ Installer သည် existing `server/.env` မှ ရွေးထားသော project နှင့် instance ကို စစ်ပြီးမှ လုပ်ဆောင်သည်။

The command prints counts, the full path of a local `accounts.txt`, and an `Open on macOS: open -t '...'` command. Copy the exact `open -t` command from the **successful** install into Terminal to see generated demo usernames/passwords. Avoid opening every `demo-private/*/accounts.txt`: an earlier failed attempt may have left an account file whose logins were never created.

The private folder is ignored by git; folder permissions are 0700 and credential file permissions 0600. Passwords are random per installation. Do not upload or commit this folder. The Owner username/password stay unchanged.

Start the API and frontend in separate terminals:

```sh
npm run dev --prefix server
```

```sh
npm run dev --prefix hrm-client
```

Open http://localhost:5173 and refresh. A DEMO notice appears in both portals. Log out before switching between accounts, or use separate browser profiles.

## What is included

| Area | Presentation examples |
| --- | --- |
| People and access | 12 fictional employees and 12 non-Owner accounts; CEO reviewer, AGM/HR, Finance, Team lead and personal employee permissions |
| Organization | Four demo departments, 12 positions, one office shift, reporting lines and weekly rosters |
| Businesses | Three **additional** labelled demo businesses: Unlock Your Future, Ai Autono, Wise Invest; shared employees have 40/30/30 cost allocation and one combined salary |
| Attendance | Approximately three weeks of check-ins, check-outs and late examples; today's records remain open for checkout; upcoming overtime requests |
| Leave | Four demo leave types, current-year entitlement (also next year when needed), approved full/half-day, pending and rejected forms; native approvals adjust balances |
| Salary | Up to three monthly THB salary-template periods per employee, with paid past periods and pending current period; all 23-column template calculations use the real salary calculator |
| Expenses | Six complete native forms: AGM pending, CEO pending above THB 5,000, approved/unpaid, paid, rejected, and conditional approval; sample receipt reference and three recognition claim examples |
| Recruitment | Published AI Automation Specialist opening, a draft designer opening, an uploaded JD text file and seven fictional PDF CVs across Applied → Screening → Interview → Offer → Hired / Rejected |
| Employee information | One approved and one pending personal-information form |
| Probation | Self-assessment invitation, pending review and confirmed example using native review stages |
| Warnings | Pending warning plus an issued and acknowledged fictional warning |
| Documents | Pending CEO review, pending HR issue and an issued generated confirmation letter, all explicitly marked DEMO and not valid proof of employment |
| Onboarding | Two cases with reusable checklists and partial completion |
| Offboarding | Planned departure with settlement on Hold, clearance tasks, exit interview and linked handover |
| Handover | Three checklist items, successor acknowledgment and downloadable fictional handover PDF |
| Performance | KPI reviews, objectives, daily tasks with manual completion evidence and anonymous peer feedback |
| Communication | Announcements, three published manual articles and in-app notifications |
| Overview | Today, Employee 360, dashboards and monthly review draw from these connected records |

Dates are generated from the current Bangkok day, not fixed to a past presentation. Leave starts at least 15 days ahead. Employee identifiers begin `DEMO-`, usernames begin `demo.`, and emails end `@demo.invalid`. Names, phone/identity fields, signatures, salaries, warnings and receipts are fictional.

Demo installation temporarily assigns approval stages to the demo reviewers, sets demo expense limits (THB 5,000; USD 100; MMK 200,000), and uses a Sunday-off leave calendar. The original workflows, routing and calendar including special dates are saved and restored on cleanup. Do not use this mode for live operations.

## Suggested walkthrough

1. **Owner:** show Apps Home, access control and the DEMO notice; keep your Owner login unchanged.
2. **`demo.agm`:** use Today → employee details → business assignments → attendance → leave balance. Show that one person can work across businesses with one salary.
3. **Employee `demo.engineer`:** show attendance, payslip, approved leave, daily tasks, profile and personal approvals. Its expense is waiting for AGM.
4. **`demo.agm`:** show an expense within the limit; **`demo.ceo`** can review the above-limit request. **`demo.finance`** shows approved/unpaid and sample paid history. No bank transfer occurs.
5. **Recruitment:** read the published JD, download its attachment and open a candidate CV. Use the current pipeline for filtering/interview screens.
6. **HR:** show probation self-assessment, warning acknowledgment, generated documents, onboarding and the departing employee's held settlement/handover.
7. **Reports:** show monthly salary differences, business cost allocations and pending follow-ups.

`demo.ceo` is a reviewer with delegated modules, **not** an Owner. Owner-only setup and AI actions remain on your existing Owner account. Personal apps are available to all demo accounts; management app access follows their saved policies.

External features still need their real configuration: AI assessment/chat, SMTP delivery, biometric hardware and QR/device/location/photo permissions. The installer provides CV text for a real AI assessment but does **not** fabricate an AI score or successful email. Receipt evidence uses an explicitly fictional external reference; attach a sample file through the actual expense UI when presenting uploads. No biometric activity, real identity documents or bank account numbers are fabricated.

## During the presentation

**New HR rows and newly uploaded HR files while demo mode is active belong to the demo batch**, including records created by Owner. New Owner accounts and Owner login sessions are protected. All other new accounts are disposable. Existing rows are never tagged merely because they were edited; edits to pre-demo people are not automatically undone.

Avoid editing pre-demo people or changing Owner branding/security settings during the demonstration. The cleanup restores approval/routing/calendar settings only; it is not a general backup restore. The installer does not enable external deliveries or automatic AI actions. Temporarily pause any already configured external automation while presenting.

```sh
npm run demo:status --prefix server
```

A second seed command detects the active batch and adds no duplicates. You can reuse the same dataset for multiple presentations; refresh it with a later explicit cleanup and new install if its dates are no longer convenient.

## Cleanup later — do not run before the demo

Demo ကို ရှင်းချိန်မှသာ server နှစ်ခုလုံးကို ရပ်ပြီး အောက်ပါ command ကို သုံးပါ:

```sh
npm run demo:clear --prefix server
```

This is a **preview**. It prints tracked record counts and files; nothing is deleted. To actually clear the batch later:

```sh
npm run demo:clear --prefix server -- --apply
```

Owner login is required again. Database deletion is transactional; original approval/routing/calendar settings are restored and every Owner is preserved. Immutable paid/issued demo history is removable only inside this Owner cleanup transaction; normal history protections remain in force. Retained pre-demo references to disposable records/files cause the entire cleanup to stop safely.

After database cleanup, storage objects are deleted through the Storage API and `accounts.txt` is removed. The retained manifest, run summary and Owner audit entry document what was cleared. A file deletion failure remains retryable; run the same clear command again. To target an older batch explicitly:

```sh
npm run demo:clear --prefix server -- --apply --run YOUR_RUN_UUID
```

A demo account promoted to Owner blocks cleanup until its ownership/link is reviewed. This prevents silently deleting an Owner.

**Cleanup scope:** this clears this tracked demo batch, its later new records/accounts and tracked HR files. It preserves all pre-demo records/accounts and Owners. It is **not** a full reset of any data that existed before installation. A future full reset, if wanted, needs a separately reviewed operation.

## Interrupted setup / recovery

If a connection fails after installation starts, the command checks whether the database transaction committed. A successful but lost response keeps its files and private account file; `demo:status` reveals whether the batch is active. Never delete files of an active run manually.

If setup did **not** commit, uploaded objects are removed automatically where possible. If removal also failed, use the UUID printed in the recovery folder:

```sh
npm run demo:recover-files --prefix server -- --run YOUR_RUN_UUID
```

Recovery authenticates Owner, checks the selected project/instance and refuses any run with an existing database record. It removes only files under that failed run's `demo/UUID/` namespace. No real HR records are deleted. Keep the folder until recovery succeeds.

If 017 is missing, apply it in the existing HR SQL Editor. If a private bucket is configured as public, correct that bucket's privacy before seeding. No secrets need to be shared with the assistant.

### `DELETE requires a WHERE clause` during demo setup

An older copy of 017 used an unconditional delete to temporarily clear special calendar dates. Supabase safe-update protection rejects it; the entire database install rolls back. Pull the latest `main`, copy **migration 018** with `pbcopy < supabase/018_demo_safe_updates.sql`, paste into a **new** query in the existing HR project's SQL Editor and Run. Rerun `npm run demo:seed --prefix server`. Migration 018 changes only the relevant function definitions; it preserves existing records and Owner logins. It also fixes the same missing-predicate issue in Owner Leave Calendar saving. Keep database safety protections enabled. No package reinstall or new Owner is needed. Use the credentials file printed by the new successful installation; old failed-run passwords do not log in.
