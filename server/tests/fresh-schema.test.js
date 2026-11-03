import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const schema = await readFile(new URL('../../supabase/001_fresh_hr_schema.sql', import.meta.url), 'utf8');
const contract = JSON.parse(await readFile(new URL('../config/hrSchema.json', import.meta.url), 'utf8'));
async function fresh() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
  await db.exec(schema);
  await db.exec(await readFile(new URL('../../supabase/003_recruitment_openings.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/004_people_access_approvals.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/005_employee_information.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/006_leave_forms.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/007_expense_forms.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/008_probation_forms.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/009_warning_forms.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/010_hr_operations.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/011_branding_owner_setup.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/012_high_priority_integrity.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/013_medium_priority.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/014_salary_template.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/015_audit_integrity.sql', import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/016_hr_completion.sql', import.meta.url),'utf8'));
  return db;
}

test('fresh schema contains all HR tables, no user records, and restricts direct browser access', async () => {
  const db = await fresh();
  try {
    for (const [table, columns] of Object.entries(contract)) {
      const count = await db.query(`SELECT count(*)::int AS n FROM public."${table}"`);
      assert.equal(count.rows[0].n, table==='hr_business_units'?5:['hr_operations_settings','hr_brand_settings','hr_expense_routing'].includes(table)?1:0, `${table} contains only declared setup metadata`);
      const actual = await db.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', ['public', table]);
      for (const c of columns) assert(actual.rows.some(r => r.column_name === c), `${table}.${c}`);
    }
    const access = await db.query("SELECT has_table_privilege('anon', 'public.sys_users', 'SELECT') AS allowed");
    assert.equal(access.rows[0].allowed, false);
    const marker = await db.query('SELECT purpose FROM hr_instance');
    assert.equal(marker.rows[0].purpose, 'lm-hr-fresh');
  } finally { await db.close(); }
});

test('schema refuses an existing application database and preserves its records', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE existing_client (name text); INSERT INTO existing_client VALUES ('preserve');");
    await assert.rejects(db.exec(schema), /empty public schema/);
    await db.exec('ROLLBACK;');
    assert.equal((await db.query('SELECT name FROM existing_client')).rows[0].name, 'preserve');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name='sys_users'")).rows[0].n, 0);
  } finally { await db.close(); }
});

test('owner bootstrap is one-time and fresh HR records can be created without imported fixtures', async () => {
  const db = await fresh();
  try {
    const id = (await db.query('SELECT id FROM hr_instance')).rows[0].id;
    await assert.rejects(db.query('SELECT bootstrap_hr_owner($1,$2,$3,$4)', ['00000000-0000-4000-8000-000000000000', 'owner', 'Owner', 'hash']), /Wrong HR instance/);
    await db.query('SELECT bootstrap_hr_owner($1,$2,$3,$4)', [id, 'owner', 'Owner', 'hash']);
    await assert.rejects(db.query('SELECT bootstrap_hr_owner($1,$2,$3,$4)', [id, 'another', 'Owner', 'hash']), /empty users and employees/);
    const employee = (await db.query('INSERT INTO "Employees" (employee_id,"Full_name") VALUES ($1,$2) RETURNING id', ['TEST-001','Test Employee'])).rows[0].id;
    await db.query("INSERT INTO attendance_records (employee_id,check_in,attendance_method) VALUES ($1,now(),'Photo')", [employee]);
    await db.query('INSERT INTO "Leave_Request" (employee_id,start_date,end_date) VALUES ($1,current_date,current_date)', [employee]);
    await db.query("UPDATE \"Leave_Request\" SET status='Approved' WHERE employee_id=$1", [employee]);
    await db.query("INSERT INTO payrolls(employee_id,month,basic_salary,net_salary) VALUES ($1,'2026-10',1000,1000)", [employee]);
    await assert.rejects(db.query("INSERT INTO payrolls(employee_id,month) VALUES ($1,'2026-10')",[employee]), /unique/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM sys_users')).rows[0].n, 1);
  } finally { await db.close(); }
});
