import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInstanceEnvironment, assertFreshInstance } from '../config/freshInstance.js';
import { validateHrAiQuery } from '../config/hrAiPolicy.js';

const env = { SUPABASE_URL: 'https://newhrproject.supabase.co', EXPECTED_SUPABASE_PROJECT_REF: 'newhrproject', HR_INSTANCE_ID: '12345678-1234-4234-8234-123456789abc', JWT_SECRET: 'a'.repeat(48) };
test('a reused or mismatched project is refused before the first database request', async () => {
  let accessed = false;
  const db = { from() { accessed = true; throw new Error('must not be reached'); } };
  await assert.rejects(assertFreshInstance(db, { ...env, EXPECTED_SUPABASE_PROJECT_REF: 'otherproject' }), /does not match/);
  assert.equal(accessed, false);
});
test('a database without this instance marker cannot start', async () => {
  const db = { from() { return { select() { return { eq() { return { async single() { return { data: null, error: new Error('missing marker') }; } }; } }; } }; } };
  await assert.rejects(assertFreshInstance(db, env), /not the initialized/);
});
test('a matching fresh HR instance can start', async () => {
  const data = { id: env.HR_INSTANCE_ID, purpose: 'lm-hr-fresh', schema_version: 1 };
  const db = { from() { return { select() { return { eq() { return { async single() { return { data, error: null }; } }; } }; } }; } };
  assert.deepEqual(await assertFreshInstance(db, env), data);
  assert.throws(() => validateInstanceEnvironment({ ...env, JWT_SECRET: 'old-fallback' }), /new JWT_SECRET/);
});
test('HR AI refuses non-HR data, credentials, joins, and unauthorized columns', () => {
  for (const args of [
    { schema: 'crm', table: 'Employees', columns: 'id' },
    { table: 'sys_users', columns: '*' },
    { table: 'Employees', columns: '*,sys_users(password_hash)' },
    { table: 'Employees', columns: 'national_id' },
    { table: 'Employees', filter_column: 'password_hash' },
  ]) assert.throws(() => validateHrAiQuery(args), /not allowed/);
  assert.equal(validateHrAiQuery({ table: 'Employees', columns: '*', limit: 99999 }).limit, 500);
});
