# Unlock Your Future HR — အသစ်စတင်ရန်

ဒီ Repo က HR သီးသန့်ဖြစ်ပါတယ်။ ဝန်ထမ်း၊ User Account၊ လစာ၊ Attendance၊ Leave၊ Documents နဲ့ AI Chat History အဟောင်းတွေကို Database အသစ်ထဲ Import မလုပ်ပါ။

## ၁။ Code အသစ်ရယူပါ

မူလ Clone Folder မှာ Code ပြင်မထားလျှင် Terminal မှာ တစ်ကြောင်းချင်း Run ပါ။

```bash
cd ~/Downloads/hrm_system_LM
git status --short
git pull --ff-only origin main
```

`git status --short` မှာ ပြင်ထားတဲ့ဖိုင်တွေ ပေါ်လာလျှင် အဲဒီဖိုင်တွေကို အရင်သိမ်းပါ။ `reset --hard` မလုပ်ပါနဲ့။

## ၂။ Supabase Project အသစ်ဖန်တီးပါ

Supabase Dashboard မှာ Project အသစ်ဖန်တီးပါ။ အဟောင်းရဲ့ Project URL၊ Database၊ Storage၊ API Keys နဲ့ `.env` ကို ပြန်မသုံးပါနဲ့။ ဒီ Code ပြင်ခြင်းက မူရင်း Client ရဲ့ Database ကို မဖျက်ပါ။

Project အသစ်ရဲ့ SQL Editor မှာ အောက်ကဖိုင်တွေကို အစဉ်လိုက် Run ပါ။

1. `supabase/001_fresh_hr_schema.sql`
2. `supabase/002_private_hr_storage.sql`
3. `supabase/003_recruitment_openings.sql`
4. `supabase/004_people_access_approvals.sql`
5. `supabase/005_employee_information.sql`
6. `supabase/006_leave_forms.sql`
7. `supabase/007_expense_forms.sql`
8. `supabase/008_probation_forms.sql`
9. `supabase/009_warning_forms.sql`
10. `supabase/010_hr_operations.sql`
11. `supabase/011_branding_owner_setup.sql`
12. `supabase/012_high_priority_integrity.sql`
13. `supabase/013_medium_priority.sql`
14. `supabase/014_salary_template.sql`
15. `supabase/015_audit_integrity.sql`
16. `supabase/016_hr_completion.sql`

ပထမ SQL က Public Schema ထဲမှာ Application Table ရှိပြီးသားဖြစ်လျှင် ရပ်သွားပါတယ်။ ရှိပြီးသား Table တွေဖျက်ပြီး ပြန် Run မလုပ်ပါနဲ့။ Database အသစ်ကို ရွေးပါ။ ပထမ SQL အောင်မြင်ပြီးနောက် ထွက်လာတဲ့ `hr_instance_id` ကို မှတ်ထားပါ။ ဒုတိယ SQL က HR Attachments အတွက် Private Storage Buckets အလွတ်တွေ ဖန်တီးပါတယ်။

ဒီအဆင့်မှာ ဝန်ထမ်း၊ User Account၊ Department၊ Position၊ Attendance၊ Payroll နဲ့ Leave Record အားလုံး အလွတ်ဖြစ်ပါတယ်။ Instance အမှတ်အသားတစ်ခုသာ ရှိပါတယ်။

## ၃။ Configuration အသစ်ဖြည့်ပါ

Project Folder ထဲမှာ —

```bash
cp server/.env.example server/.env
```

`server/.env` ထဲမှာ အောက်ပါအချက်တွေဖြည့်ပါ။

| Setting | ဖြည့်ရန် |
|---|---|
| `SUPABASE_URL` | Project အသစ်ရဲ့ URL |
| `SUPABASE_SERVICE_KEY` | Project အသစ်ရဲ့ Server-side Service Role Key |
| `EXPECTED_SUPABASE_PROJECT_REF` | Project အသစ်ရဲ့ Reference ID |
| `HR_INSTANCE_ID` | အဆင့် ၂ ကရတဲ့ Instance ID |
| `JWT_SECRET` | အသစ်ထုတ်ထားတဲ့ Secret |

JWT Secret အသစ်ထုတ်ရန် —

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

ရလာတဲ့တန်ဖိုးကို `JWT_SECRET=` နောက်မှာ ထည့်ပါ။ Secret နဲ့ API Key တွေကို Chat သို့မဟုတ် GitHub ထဲ မတင်ပါနဲ့။ ဝန်ထမ်းတွေရဲ့ Password အနည်းဆုံးလိုအပ်ချက်နဲ့ ဒီ Server Secret အရှည်က သီးခြားဖြစ်ပါတယ်။

AI၊ Telegram၊ Recruitment Email နဲ့ Recruitment Facebook Posting အတွက် Settings တွေကို မချိတ်ရသေးလျှင် အလွတ်ထားနိုင်ပါတယ်။ အဟောင်းရဲ့ Bot၊ Email Account သို့မဟုတ် Facebook Account ကို အလိုအလျောက် ပြန်မချိတ်ပါ။

## ၄။ Dependencies တင်ပါ

Node.js 24 ကို အသုံးပြုပြီး —

```bash
npm ci --prefix server
npm ci --prefix hrm-client
```

Puppeteer Download မလိုပါက `PUPPETEER_SKIP_DOWNLOAD=true` သတ်မှတ်နိုင်ပါတယ်။ အဲဒီလိုသတ်မှတ်ထားရင် PDF Export အတွက် Chromium Path ကို သီးခြားပေးရပါတယ်။ Docker Image မှာ Chromium ပါဝင်ပါတယ်။

## ၅။ Owner Account အသစ်ဖန်တီးပါ

```bash
npm run setup:owner --prefix server
```

Terminal က Username၊ Display Name နဲ့ Password အသစ်ကို မေးပါမယ်။ ကိုယ်တိုင်သတ်မှတ်ပါ။ Password ရိုက်တဲ့အခါ စာလုံးမပေါ်တာ ပုံမှန်ပါ။ User/Employee ရှိပြီးသားဖြစ်လျှင် ဒီ Setup က မဖျက်ဘဲ ရပ်သွားပါမယ်။ Default Admin Password မရှိပါ။

## ၆။ Local မှာ Run ပါ

Terminal တစ်ခုမှာ —

```bash
npm run dev --prefix server
```

နောက် Terminal တစ်ခုမှာ —

```bash
npm run dev --prefix hrm-client
```

Browser မှာ `http://localhost:5173` ဖွင့်ပြီး Owner အသစ်နဲ့ Login ဝင်ပါ။

## ၇။ ပထမဆုံး HR အချက်အလက်တွေ ဖြည့်ပါ

1. Departments တွေ ဖန်တီးပါ။
2. Positions တွေ ဖန်တီးပါ။
3. Attendance ထဲမှာ Shifts နဲ့ Roster တွေ သတ်မှတ်ပါ။
4. Leave Types နဲ့ Leave Balances တွေ သတ်မှတ်ပါ။
5. Payroll Policy နဲ့ KPI Settings ကို စစ်ပြီး မိမိလုပ်ငန်းနဲ့အညီ သိမ်းပါ။ Code Default က လစာ Divisor 26 နဲ့ Sunday ပိတ်ရက်ဖြစ်ပါတယ်။ အဟောင်းက User Record တွေတော့ မပါပါ။
6. Employee အသစ်ဖန်တီးပါ။ System က ယာယီ Password အသစ်တစ်ခု ထုတ်ပေးပါမယ်။ ဝန်ထမ်းက ပထမဆုံး Login မှာ Password ပြောင်းရပါတယ်။
7. Employee Portal က Attendance နဲ့ Leave Request စမ်းပြီး Owner ဘက်က Approval စစ်ပါ။

Company Manual၊ SOP Template နဲ့ Onboarding Template အဟောင်းတွေကို Import မလုပ်ထားပါ။ ကိုယ့်လုပ်ငန်းအတွက် အသစ်ဖြည့်နိုင်ပါတယ်။

## Live သုံးမည့်အခါ

ဒီ Repo မှာ အဟောင်းရဲ့ Auto-deployment၊ Server Path၊ Docker Registry Image နဲ့ Domain တွေ ဖြုတ်ထားပါတယ်။ CI က Build နဲ့ Tests သာ လုပ်ပါတယ်။ Live Deploy မလုပ်ပါ။ Docker Compose က Localhost Port 8081 နဲ့ သီးခြား Volume ကို သုံးပါတယ်။ HTTPS၊ Domain အသစ်၊ Backups နဲ့ Supabase ပေါ်က Integration စမ်းသပ်မှုတွေ ပြီးမှ Live သုံးပါ။

## Cleanup အကန့်အသတ်

လက်ရှိ Source ထဲက အဟောင်း SSH Key၊ Uploads၊ Seed/Repair Scripts နဲ့ Client-specific Data/Overrides တွေ ဖြုတ်ထားပါတယ်။ ပုံမှန် Git Commit နဲ့ ပြင်ထားခြင်းဖြစ်လို့ အဟောင်း Commit History ကို မပြန်ရေးထားပါ။ အရင်ပေါက်ကြားခဲ့တဲ့ SSH Key ကို အသုံးပြုနေသေးလျှင် သက်ဆိုင်ရာ Server မှာ အဟောင်း Access ကို ပိတ်ပြီး Key အသစ်ပြောင်းရပါမယ်။ ဒီ Repo Cleanup က အဲဒီ Key ကို မပိတ်ပေးနိုင်ပါ။

Original Supabase Project ထဲက Data ကို ဒီလုပ်ဆောင်မှုမှာ မဖျက်ထားပါ။ User Data အလွတ်နဲ့ စတင်ဖို့ Database အသစ်လိုပါတယ်။

Expense Form update အတွက် `supabase/007_expense_forms.sql` ကို 006 အပြီး ထည့်ပါ။ အဆင့်များကို [EXPENSES.md](EXPENSES.md) တွင် ကြည့်ပါ။

Probation Form update အတွက် `supabase/008_probation_forms.sql` ကို 007 အပြီး ထည့်ပါ။ သုံးခွင့်၊ အတည်ပြုအဆင့်နှင့် Employee app အတွက် [PROBATION.md](PROBATION.md) ကို ကြည့်ပါ။

Warning Letter update အတွက် `supabase/009_warning_forms.sql` ကို 008 အပြီး ထည့်ပါ။ [WARNINGS.md](WARNINGS.md) နှင့် [စုပေါင်း စမ်းသပ်ရန် အဆင့်များ](HR_ACCEPTANCE.md) ကို ကြည့်ပါ။

Today / Reminders / Employee 360 / Business ချိတ်ဆက်မှု / Monthly review အတွက် 009 အပြီး `supabase/010_hr_operations.sql` ကိုသာ ထပ် Run ပါ။ [သတ်မှတ်ရန်နှင့် သုံးရန် အဆင့်များ](OPERATIONS.md) တွင် ကြည့်ပါ။ Owner မှ Today နှင့် Monthly review သုံးခွင့်များကို သီးခြားပေးရန် လိုသည်။ Reminder သည် မူလအနေဖြင့် ပိတ်ထားသည်။

Branding နှင့် Owner Setup အတွက် 010 အပြီး `supabase/011_branding_owner_setup.sql` ကိုသာ ထပ် Run ပါ။ [စတင်သတ်မှတ်ရန် အဆင့်များ](BRANDING_SETUP.md) ကို ကြည့်ပါ။

ရှိပြီးသား HR System ကို Update လုပ်ရန် 011 အပြီး `supabase/012_high_priority_integrity.sql` ကိုသာ Run ပါ။ [High Priority ပြင်ဆင်မှုနှင့် Update အဆင့်များ](HIGH_PRIORITY_FIXES.md) ကို ကြည့်ပါ။ Database အသစ်၊ Owner အသစ် ပြန်မဖန်တီးပါနှင့်။

Dependency Security Update အတွက် Database Migration အသစ် မလိုပါ။ Code Pull လုပ်ပြီး `npm ci --prefix server` နဲ့ `npm ci --prefix hrm-client` Run ပါ။ Local PDF အတွက် Browser မရှိသေးပါက `npm run setup:browser --prefix server` ကို Run ပါ။ Existing Chrome သုံးမည်ဆို `PUPPETEER_EXECUTABLE_PATH` ကို သတ်မှတ်နိုင်ပါတယ်။

Medium Priority ပြင်ဆင်ချက်များအတွက် 012 အပြီး `supabase/013_medium_priority.sql` ကို လက်ရှိ HR Project ထဲ Run ပါ။ Server/Frontend ပြန်စပြီး လက်ရှိ Account နဲ့ Login ပြန်ဝင်ပါ။ အသုံးပြုသူ သို့မဟုတ် Database အသစ် ပြန်မဖန်တီးပါနှင့်။ [အသေးစိတ်ပြင်ဆင်ချက်များ](MEDIUM_PRIORITY_FIXES.md) ကို ကြည့်ပါ။

Salary Template နှင့် Portal Back ခလုတ် Update အတွက် 013 အပြီး `supabase/014_salary_template.sql` ကို လက်ရှိ HR Project ထဲ Run ပါ။ လစာဟောင်းနှင့် ဝန်ထမ်းအချက်အလက်များကို မဖျက်ပါ။ [သုံးနည်းနှင့် တွက်ချက်ပုံ](SALARY_TEMPLATE.md) ကို ကြည့်ပါ။

Audit ပြင်ဆင်ချက် High ၈ ခု / Medium ၁၅ ခု / Low ၄ ခု အတွက် 014 အပြီး `supabase/015_audit_integrity.sql` ကို လက်ရှိ HR Project ထဲ Run ပါ။ ဝန်ထမ်း၊ Login၊ လစာနှင့် ထုတ်ပြီးစာရွက်များကို ဆက်ထိန်းထားပါသည်။ [ပြင်ဆင်ချက်နှင့် Update အဆင့်များ](FULL_AUDIT_FIXES.md) ကို ကြည့်ပါ။

Release 016 အတွက် `supabase/016_hr_completion.sql` ကို 015 အပြီး လက်ရှိ HR Project တွင် Run ပါ။ Amount-based Expense၊ Portal UI၊ Owner Setup နှင့် Owner/Employee လမ်းညွှန်များ ပါဝင်သည်။ [ပြီးစီးသောလုပ်ဆောင်ချက်နှင့် အဆင့်များ](IMPLEMENTATION_STATUS.md) ကို ဖတ်ပါ။

For fictional client presentation data on an existing installation, use [CLIENT_DEMO.md](CLIENT_DEMO.md). Migration 017 installs optional Owner-only demo tooling; it does not seed people by itself. Never rerun 001 on this existing project.
