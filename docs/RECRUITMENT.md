# UYF Recruitment — Job Openings & Supporting Files

## Existing system update

This is an additive upgrade for the existing UYF HR project. It preserves users, employees, positions, candidates, payroll and other HR records.

1. Stop the frontend and backend with Ctrl+C in their terminals.
2. In the Mac repository:

```bash
cd "$HOME/Downloads/hrm_system_LM"
git pull --ff-only origin main
npm ci --prefix server
pbcopy < supabase/003_recruitment_openings.sql
```

3. Open the Supabase project used by **this UYF system**. Open SQL Editor → New query, paste with Cmd+V and click Run. This creates the job-opening tables, candidate links and the private `recruitment_documents` bucket. It can be rerun safely. **Do not rerun 001 or delete/reset any data.**
4. Start the backend:

```bash
cd "$HOME/Downloads/hrm_system_LM"
npm run dev --prefix server
```

5. Start the frontend in another terminal:

```bash
cd "$HOME/Downloads/hrm_system_LM"
npm run dev --prefix hrm-client -- --strictPort
```

6. Open http://localhost:5173 and refresh. Recruitment now starts with **Job openings** for Owner/Admin/HR/General Manager roles. Roles without HR management permission keep the candidate view.

## အလုပ်ခေါ်ယူမှုအသစ် ဖန်တီးရန်

1. Recruitment → **Job openings → Create job opening** ကို နှိပ်ပါ။
2. ရှိပြီးသား Position ကို ရွေးပြီး အလုပ်ခေါင်းစဉ် ထည့်ပါ။ ရာထူးမရှိသေးပါက Positions မှာ အရင်ဖန်တီးပါ။
3. Job Description၊ Must-have၊ Nice-to-have၊ အလုပ်နေရာ/အချိန်၊ ခေါ်ယူမည့်ဦးရေ၊ ပိတ်ရက်နှင့် ခံစားခွင့်များ ဖြည့်ပါ။ အဆင်သင့်မဖြစ်သေးလည်း **Save draft** နှိပ်နိုင်ပါသည်။
4. ကြေညာမည့် လစာအပိုင်းအခြားကို ထည့်နိုင်ပါသည်။ Salary visibility ပိတ်ထားလျှင် Public Careers API နှင့် ကြေညာစာရေးပေးသည့် AI ဆီသို့ လစာပမာဏများ မပို့ပါ။ ဝန်ထမ်း Payroll လစာနှင့် သီးခြားဖြစ်ပါသည်။

## JD / Requirements ဖိုင်မှ စာသားထည့်ရန်

1. မူကြမ်းသိမ်းပြီး **Supporting files** အဆင့်ကို ဝင်ပါ။
2. PDF၊ DOCX သို့မဟုတ် UTF-8 TXT ဖိုင်ကို ရွေးတင်ပါ။ တစ်ဖိုင်လျှင် 10 MB အထိ၊ Opening တစ်ခုလျှင် ဖိုင် ၁၂ ဖိုင်အထိ ရပါသည်။ ဖိုင်အများအပြားကို တစ်ခါတည်းရွေးလျှင် အစဉ်လိုက်တင်ပါမည်။
3. **Review extracted text** နှိပ်ပြီး စာသားမှန်မမှန် စစ်ပါ။ မလိုသောစာများ ဖယ်ရှားနိုင်ပါသည်။
4. **Add reviewed text to** မှ JD / Must-have / Nice-to-have ကို ရွေးပါ။ **Add to draft** နှိပ်ပါ။ ရှိပြီးသားစာသားကို မဖျက်ဘဲ ထပ်ဖြည့်ပါမည်။
5. လိုအပ်လျှင် တူညီသောဖိုင်ကို ပြန်ဖွင့်ပြီး အခြားအပိုင်းအတွက် စာသားကို သီးသန့်ရွေးထည့်ပါ။ ပြီးလျှင် **Save draft** နှိပ်ပါ။

စာသားပါ PDF များကို ဖတ်ထုတ်နိုင်ပါသည်။ Scanned PDF၊ password ပါဖိုင်၊ စာလုံးဖောင့်မမှန်ဖိုင် သို့မဟုတ် ပျက်နေသောဖိုင်များတွင် ကိုယ်တိုင်စာဖြည့်ရနိုင်ပါသည်။ PDF ဖတ်ခြင်းကို စာမျက်နှာ ၅၀ အထိနှင့် ၂၀ စက္ကန့်အထိ ကန့်သတ်ထားပါသည်။ ဖတ်ထုတ်သောစာ အများဆုံး စာလုံးရေ ၅၀,၀၀၀ ဖြစ်ပြီး အပိုင်းတစ်ခုစီတွင် ၃၀,၀၀၀ အထိ ထည့်နိုင်ပါသည်။ `.doc` ဖိုင်ဟောင်းကို `.docx` သို့ ပြောင်းပြီးတင်ပါ။

မူရင်းဖိုင်များကို HR management ခွင့်ရှိသူများသာ ဖွင့်နိုင်ပါသည်။ Public Careers တွင် မူရင်းဖိုင်များနှင့် ဖတ်ထုတ်ထားသောစာအားလုံးကို တိုက်ရိုက်မဖော်ပြပါ။ AI matching သည် HR က အလုပ်အချက်အလက်ထဲထည့်ပြီး အတည်ပြုကြေညာထားသောစာကိုသာ အသုံးပြုပါသည်။

## ကြေညာရန်နှင့် လျှောက်လွှာလက်ခံရန်

1. **Review & publish** အဆင့်တွင် Public preview ကို စစ်ပါ။ JD နှင့် Must-have မရှိပါက ကြေညာမရပါ။
2. စစ်ပြီးကြောင်း Checkbox ကို အမှန်ခြစ်ပြီး **Publish opening** နှိပ်ပါ။
3. **Copy application link** ဖြင့် အလုပ်တစ်ခုချင်းစီ၏ လင့်ခ်ကို မျှဝေနိုင်ပါသည်။ `/careers` မှာလည်း လက်ရှိကြေညာထားသောအလုပ်အားလုံး ပြပါမည်။
4. **Draft announcement with AI** က အတည်ပြုထားသောအချက်များအပေါ် အခြေခံပြီး စာမူကြမ်း ရေးပေးပါသည်။ ပြန်စစ်ပြီး ကိုယ်တိုင်ကူးယူမျှဝေပါ။ အလိုအလျောက် မပို့ပါ။
5. အလုပ်ကြည့်သူက JD/Requirements ဖတ်ပြီး အမည်၊ Email၊ CV နှင့် Cover Letter ဖြင့် လျှောက်နိုင်ပါသည်။
6. Recruitment → **Candidates** တွင် Opening အလိုက် စစ်ကြည့်နိုင်ပါသည်။ HR က **Add Candidate** ဖြင့်လည်း ကြေညာပြီးသော Opening ကို ရွေး၍ CV တင်နိုင်ပါသည်။ Position-only မှတ်တမ်းဟောင်းများကို ဆက်ထားနိုင်ပါသည်။

## AI စစ်ဆေးမှုနှင့် ပြင်ဆင်ချက်များ

- Gemini API configured ဖြစ်ပါက CV/Cover Letter ကို အဲဒီလျှောက်လွှာအတွက် ကြေညာထားသော JD/Requirements နှင့် နှိုင်းယှဉ်ပါသည်။ Score၊ ကိုက်ညီမှုအထောက်အထား၊ သေချာမကိုက်ညီသောအချက်နှင့် မသိရသေးသောအချက်တို့ကို ခွဲပြပါသည်။
- CV မှာ မပါသောအချက်ကို အရည်အချင်းမရှိဟု သတ်မှတ်ရန် မညွှန်ကြားထားပါ။ HR က စစ်ဆေးပြီး နောက်ဆုံးဆုံးဖြတ်ရပါမည်။
- API key မရှိခြင်း၊ AI service ပြဿနာ သို့မဟုတ် စစ်ဆေးရန် အချက်အလက်မရှိခြင်းတို့တွင် လျှောက်လွှာကို ဆက်သိမ်းပြီး **Not assessed** ပြပါမည်။ ရမှတ်အတု မထည့်ပါ။ AI က Candidate status ကို အလိုအလျောက် ပြောင်းခြင်းမရှိပါ။
- Candidate အသေးစိတ်ထဲမှ **Generate interview questions** သည် အဲဒီလျှောက်လွှာနှင့်အတူ သိမ်းထားသော JD ဗားရှင်းကို အသုံးပြုပါသည်။
- Published opening ကို ပြင်ပြီး **Save draft** နှိပ်လျှင် Public နှင့် AI က နောက်ဆုံးကြေညာထားသော ဗားရှင်းကို ဆက်သုံးပါသည်။ ပြန်စစ်ပြီး **Publish updated details** နှိပ်မှ ဗားရှင်းအသစ် သုံးပါမည်။
- အရင်လျှောက်လွှာများသည် သူတို့လျှောက်ခဲ့သည့် JD ဗားရှင်းကို ဆက်ထိန်းထားပါသည်။ ရာထူးအခြားတစ်ခုသို့ Candidate ကို ပြန်စဉ်းစားရန် ရွှေ့ပါက မူရင်းရာထူးအတွက် AI score ကို ဖယ်ရှားပါသည်။
- **Close opening** နှိပ်ပြီး အတည်ပြုလျှင် လျှောက်လွှာအသစ်များ လက်မခံတော့ပါ။ ရှိပြီးသား Candidate များ ကျန်ရှိပါသည်။ ပိတ်ရက်ကျော်သော Opening များလည်း Bangkok ရက်စွဲအလိုက် လက်ခံမှုရပ်ပါသည်။
- အရင် `Positions → Hiring` switch အစား Recruitment တွင် Opening ဖန်တီးပြီး စစ်ဆေးကြေညာသည့် လမ်းကြောင်းကို သုံးပါ။ ရှိပြီးသားရာထူးများမှ အလုပ်ခေါ်စာများကို အလိုအလျောက် မကြေညာပါ။

## Verification

Automated tests cover additive/idempotent migration with preserved records, private bucket/table permissions, TXT/DOCX/PDF extraction, invalid/oversized formats, snapshot consistency, salary visibility, Bangkok deadlines, draft/publish/apply/republish/close routes, original-file access, stale-edit conflicts and candidate history. These use isolated PostgreSQL and a storage adapter. Real Supabase bucket provisioning, Gemini output and email/social integrations need configuration in the target environment; no live messages are sent by these tests.
