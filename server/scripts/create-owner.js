import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { supabaseAdmin } from '../lib/supabase.js';
import { assertFreshInstance } from '../config/freshInstance.js';
import bcrypt from 'bcryptjs';

async function readPassword(prompt) {
  if (!stdin.isTTY) throw new Error('Run setup in an interactive terminal; passwords are not accepted as command arguments.');
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = chunk => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') { cleanup(); reject(new Error('Cancelled')); return; }
        if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    const cleanup = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    stdin.on('data', onData);
  });
}

try {
  await assertFreshInstance(supabaseAdmin);
  const rl = createInterface({ input: stdin, output: stdout });
  const username = (await rl.question('New owner username: ')).trim().toLowerCase();
  const fullName = (await rl.question('Owner display name: ')).trim();
  rl.close();
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) throw new Error('Use 3–64 letters, numbers, dots, underscores or hyphens.');
  const password = await readPassword('New password (hidden, at least 6 characters): ');
  const confirmation = await readPassword('Repeat password: ');
  if (password.length < 6 || password !== confirmation) throw new Error('Passwords must match and contain at least 6 characters.');
  const { error } = await supabaseAdmin.rpc('bootstrap_hr_owner', {
    expected_instance: process.env.HR_INSTANCE_ID,
    owner_username: username,
    owner_name: fullName || username,
    owner_password_hash: await bcrypt.hash(password, 12),
  });
  if (error) throw error;
  console.log('Owner created. No employee or imported records were created. Sign in using the new credentials.');
} catch (error) {
  console.error('Setup stopped:', error.message);
  process.exitCode = 1;
}
