export const INSTANCE_PURPOSE = 'lm-hr-fresh';

export function validateInstanceEnvironment(env = process.env) {
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw new Error('Set the NEW Supabase project URL.'); }
  const projectRef = url.hostname.replace(/\.supabase\.co$/, '');
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) {
    throw new Error('SUPABASE_URL must be the HTTPS URL of the new Supabase project.');
  }
  if (!env.EXPECTED_SUPABASE_PROJECT_REF || projectRef !== env.EXPECTED_SUPABASE_PROJECT_REF) {
    throw new Error('Database project does not match EXPECTED_SUPABASE_PROJECT_REF. Startup blocked.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(env.HR_INSTANCE_ID || '')) {
    throw new Error('Set HR_INSTANCE_ID to the identifier returned by the fresh database migration.');
  }
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || /your_|fallback|example/i.test(env.JWT_SECRET)) {
    throw new Error('Generate a new JWT_SECRET (at least 32 characters) for this instance.');
  }
  return { projectRef, instanceId: env.HR_INSTANCE_ID };
}

export async function assertFreshInstance(db, env = process.env) {
  const { instanceId } = validateInstanceEnvironment(env);
  const { data, error } = await db.from('hr_instance').select('id,purpose,schema_version').eq('id', instanceId).single();
  if (error || !data || data.purpose !== INSTANCE_PURPOSE || data.schema_version !== 1) {
    throw new Error('This database is not the initialized HR instance. Startup blocked; no jobs started.');
  }
  return data;
}
