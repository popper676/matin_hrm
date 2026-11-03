# Shared branding and guided Owner setup

Existing installations through 010: apply only **supabase/011_branding_owner_setup.sql** in the current HR Supabase project after pulling this update. Existing employees, accounts, salaries, approvals, submitted forms and business history are preserved. No new packages or secrets are required.

## Mac update / Mac တွင် Update ထည့်ရန်

1. Stop both development terminals with Ctrl+C.
2. In the repository folder, run these one at a time:

       git pull --ff-only origin main

       pbcopy < supabase/011_branding_owner_setup.sql

3. Open the existing HR project's Supabase SQL Editor, create a new query, paste and Run. Install 010 first if it is not already installed. Do not rerun 001 or create another Owner.
4. Start **npm run dev --prefix server** and **npm run dev --prefix hrm-client** in separate terminals.
5. Sign in as Owner. Open **Owner setup / Owner စတင်သတ်မှတ်ရန်** from Apps Home. **Branding settings / Branding သတ်မှတ်ချက်များ** is also a separate Owner app.

## Branding / Brand သတ်မှတ်ချက်များ

Owner can edit the shared company name, tagline, accent color, optional public website URL, logo, interview email subject/body and email signature. The default name is **Unlock Your Future**. The public brand endpoint publishes only the name, tagline, accent, current logo URL and version; email wording and internal settings require Owner access.

- Shared identity appears in login, app headers/footers, careers/job details, employee information, Today, AI welcome/report naming and manual exports.
- Leave, Expense, Probation and Warning PDF headers use the current brand identity and optional uploaded logo. This changes presentation; submitted data, approval histories and reference numbers are not rewritten.
- Recruitment invitations use the saved name, subject, body and signature. Preview and Save do not send email. Actual sending still needs the existing SMTP configuration and an explicit Recruitment action.
- Existing configured announcement/AI messages use the shared name when generated in future. Previously stored messages/documents remain as written.
- Technical identifiers such as database purpose, internal payroll company key, URLs and saved language preferences stay compatible. Branding does not change payroll rules.
- Controls and accent text use readable light/dark variants of the chosen color. Semantic success/error colors retain their meanings.

### Logo

Upload PNG or JPEG up to 2 MB and 4096 × 4096 pixels. Transparent PNG is supported; SVG uploads are not accepted. The existing SVG remains the default.

The private **branding_assets** bucket is created by migration 011. Only the currently selected company logo is intentionally available from the public logo route, because login and careers must display it before authentication. Other private HR files are unrelated. Previous logos stop being published after replacement/removal; existing signed links can remain valid for up to 60 seconds. Owner can restore the default logo.

A public HTTPS website URL allows the uploaded logo to appear in recruitment emails. Leave it blank during local setup. HTTP localhost is accepted for local development.

### Email variables

- Subject: **{{company}}**, **{{position}}**, optional **{{candidate}}**.
- Body: **{{candidate}}**, **{{position}}**, **{{meeting_details}}**, **{{signature}}**, optional **{{company}}**, **{{tagline}}**.
- Signature: **{{company}}**, optional **{{tagline}}**.

Required variables preserve essential invitation details. Templates are plain text; generated HTML escapes inserted names/content. Preview uses synthetic candidate details. Owner setup sends no test/live emails.

## Seven setup steps / Setup အဆင့် ၇ ဆင့်

1. **Branding:** review name, logo, color and email wording; save edits.
2. **Businesses:** review real business names and archive unused seeded choices.
3. **Employees:** add staff and assign at least one active current business to each active employee using Employee 360. Future membership does not replace current membership early.
4. **Access:** save explicit access settings for active non-Owner accounts. Personal-only access is valid. The guide never grants permissions automatically.
5. **Approvals:** activate all five existing form workflows. Reviewers must be active and retain required permissions. Their own employee records require independent alternates. Original workflow routes still validate actual submissions/decisions.
6. **Leave:** set valid work hours/calendar and leave types. Review yearly entitlements and intentional omissions. No entitlement is created automatically.
7. **Payroll:** review salaries, policy and KPI settings. Owner may intentionally retain documented defaults after review. The guide does not prepare payroll or mark payments.

Each step shows **Needs setup / သတ်မှတ်ရန်လို**, **Needs review / စစ်ဆေးရန်လို**, or **Reviewed / စစ်ပြီး**. Fix missing settings through linked configuration screens, check the confirmation and select **Review & continue / စစ်ပြီး ဆက်သွားရန်**.

Progress is saved in the database. Relevant configuration changes invalidate the affected review using a source fingerprint; an old tab cannot sign off a changed source. Ordinary attendance, expense activity and leave usage do not reset configuration review. Changes to entitlements, year, active accounts, reviewer permissions, business membership, branding or payroll policy can require another review.

An Owner-only Apps Home banner links back to unfinished setup. Linked settings pages offer a return-to-setup link. Normal portal use is not blocked.

**Seven reviewed means configuration review is complete.** Final live testing and deployment remain separate. The guide never deploys, enables reminders, sends messages, grants permissions or changes salaries. Manual testing remains deferred as requested.

## Verification

Checks cover template/URL/image validation, readable contrast, safe email rendering, Owner-only settings/reviews, public projection, private logo upload/current-logo access, version conflicts, migration/reruns, fingerprints, reviewer revocation/alternates, unchanged employee/payroll counts and branded PDF content. Browser checks exercise branding edits/upload/preview, signoff, linked configuration/return navigation, persisted/invalidated progress, employee portal branding, denied editor URLs and desktop/mobile EN/MM light/dark layouts.
