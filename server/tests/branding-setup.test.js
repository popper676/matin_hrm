import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {DEFAULT_BRANDING,cleanBranding,renderInterviewEmail,brandPalette,contrastRatio} from '../../shared/branding.js';
import {cleanLogo} from '../lib/brandingFiles.js';
import {buildOwnerSetup} from '../lib/ownerSetup.js';
import {setupFixture,logoPng} from './brandingFixtures.js';
test('brand settings validate URLs, color, template variables and header boundaries',()=>{
 const clean=cleanBranding(DEFAULT_BRANDING);assert.equal(clean.name,'Unlock Your Future');
 for(const change of [{name:'x'},{name:'Name\nInjected'},{accent:'#xyzxyz'},{website_url:'javascript:alert(1)'},{website_url:'https://name:secret@example.test'},{interview_subject:'Interview {{company}}'},{interview_body:'{{unknown}}'},{email_signature:'HR'}])assert.throws(()=>cleanBranding({...DEFAULT_BRANDING,...change}));
 assert.equal(cleanBranding({...DEFAULT_BRANDING,website_url:'https://example.test/'}).website_url,'https://example.test');
});
test('email templates use current identity, escape HTML and never recurse into inserted values',()=>{
 const b={...DEFAULT_BRANDING,name:'UYF <Team>',tagline:'People & HR',email_signature:'HR\n{{company}}'},mail=renderInterviewEmail(b,{candidate:'<img src=x onerror=alert(1)>',position:'Engineer\r\nBcc: victim@example.test',meeting_details:'Office & online'});
 assert(mail.subject.includes(b.name));assert(!/[\r\n]/.test(mail.subject));assert(mail.text.includes(b.name));assert(mail.html.includes('&lt;img'));assert(!mail.html.includes('<img src=x'));assert(!mail.html.includes('LM Group'));
 assert(renderInterviewEmail({...b,name:'{{signature}}'},{candidate:'A',position:'B',meeting_details:'C'}).text.includes('{{signature}}'));
});
test('brand controls retain readable colors and uploaded logos reject executable, oversized and invalid images',()=>{
 for(const color of ['#ffffff','#ffff00','#000000','#2455aa','#d21d3c'])for(const dark of [false,true]){const p=brandPalette(color,dark);assert(contrastRatio(p.accent,'#ffffff')>=4.5);assert(contrastRatio(p.text,dark?'#191e2b':'#ffffff')>=4.5);}
 const bytes=logoPng(),file={buffer:bytes,size:bytes.length,originalname:'team.png'};assert.equal(cleanLogo(file).mime,'image/png');
 assert.throws(()=>cleanLogo({...file,buffer:Buffer.from('<svg onload="alert(1)"/>')}),/PNG/);
 assert.throws(()=>cleanLogo({...file,size:2097153}),/2 MB/);
 const giant=Buffer.from(bytes);giant.writeUInt32BE(4097,16);assert.throws(()=>cleanLogo({...file,buffer:giant}),/4096/);
});
test('setup completion requires explicit reviews and follows relevant configuration changes only',()=>{
 const d=setupFixture();let report=buildOwnerSetup(d,'2026-10-20');assert.equal(report.completed,0);assert(report.steps.every(v=>v.state==='review'));
 d.reviews=report.steps.map(v=>({step:v.key,fingerprint:v.fingerprint,version:1,reviewed_at:'2026-10-20T00:00:00Z'}));report=buildOwnerSetup(d,'2026-10-20');assert(report.all_complete);d.workflows.reverse();assert(buildOwnerSetup(d,'2026-10-20').all_complete,'source row ordering does not invalidate a saved review');
 d.balances[0].version++;assert(buildOwnerSetup(d,'2026-10-20').all_complete,'normal leave usage does not invalidate entitlement configuration review');
 d.employees[0].salary=3500;report=buildOwnerSetup(d,'2026-10-20');assert.equal(report.steps.find(v=>v.key==='payroll').state,'review');assert.equal(report.steps.find(v=>v.key==='employees').state,'complete');
 d.branding.settings={...d.branding.settings,name:'New identity'};assert.equal(buildOwnerSetup(d,'2026-10-20').steps[0].state,'review');
 d.businesses[0].is_active=false;report=buildOwnerSetup(d,'2026-10-20');assert.equal(report.steps.find(v=>v.key==='businesses').state,'blocked');assert.equal(report.steps.find(v=>v.key==='employees').state,'complete','expense business tags cannot block organization-wide employee readiness');
});
test('setup catches revoked reviewers, missing saved access and self-review routes needing alternates',()=>{
 const d=setupFixture(),expense=d.workflows.find(v=>v.workflow_key==='expense'),staff=d.users[1];d.policies[0].policy.modules={rewards:['view','approve']};expense.stages[1].assignee_id=staff.id;
 let step=buildOwnerSetup(d,'2026-10-20').steps.find(v=>v.key==='approvals');assert.equal(step.state,'blocked');assert(step.issues.some(v=>v.en.includes('alternate')));
 expense.stages[1].alternate_id=d.users[0].id;assert(buildOwnerSetup(d,'2026-10-20').steps.find(v=>v.key==='approvals').can_review);
 d.users[1].is_active=false;assert.equal(buildOwnerSetup(d,'2026-10-20').steps.find(v=>v.key==='approvals').state,'blocked');
 d.users[1].is_active=true;d.policies=[];assert.equal(buildOwnerSetup(d,'2026-10-20').steps.find(v=>v.key==='access').state,'blocked');
});
test('branding/setup migration preserves settings on rerun and enforces Owner, version and service-only writes',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;');
  for(const name of ['001_fresh_hr_schema','003_recruitment_openings','004_people_access_approvals','005_employee_information','006_leave_forms','007_expense_forms','008_probation_forms','009_warning_forms','010_hr_operations','011_branding_owner_setup'])await db.exec(await readFile(new URL('../../supabase/'+name+'.sql',import.meta.url),'utf8'));
  const owner=(await db.query("INSERT INTO sys_users(username,password_hash,role,is_owner,is_active) VALUES('owner','hash','boss',true,true) RETURNING id")).rows[0].id,staff=(await db.query("INSERT INTO sys_users(username,password_hash,role,is_active) VALUES('staff','hash','employee',true) RETURNING id")).rows[0].id,settings={...DEFAULT_BRANDING,name:'UYF Team'};
  await assert.rejects(db.query('SELECT * FROM hr_save_branding($1,$2,$3)',[staff,JSON.stringify(settings),1]),/Owner/);
  await db.query('SELECT * FROM hr_save_branding($1,$2,$3)',[owner,JSON.stringify(settings),1]);await assert.rejects(db.query('SELECT * FROM hr_save_branding($1,$2,$3)',[owner,JSON.stringify(settings),1]),/changed/);
  const fingerprint='a'.repeat(64);await db.query('SELECT * FROM hr_review_owner_setup($1,$2,$3,$4)',[owner,'branding',fingerprint,0]);await assert.rejects(db.query('SELECT * FROM hr_review_owner_setup($1,$2,$3,$4)',[owner,'branding',fingerprint,0]),/changed/);
  await assert.rejects(db.query('UPDATE hr_brand_settings SET version=3'),/Owner branding/);
  await db.exec(await readFile(new URL('../../supabase/011_branding_owner_setup.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('SELECT settings FROM hr_brand_settings')).rows[0].settings.name,'UYF Team');assert.equal((await db.query('SELECT count(*)::int n FROM hr_owner_setup_reviews')).rows[0].n,1);
  assert.equal((await db.query("SELECT has_table_privilege('anon','hr_brand_settings','SELECT') allowed")).rows[0].allowed,false);
  assert.equal((await db.query("SELECT has_function_privilege('authenticated','hr_save_branding(uuid,jsonb,integer)','EXECUTE') allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
