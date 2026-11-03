import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'dist', '.git', 'uploads'].includes(entry.name)) return [];
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}
for (const file of walk(path.join(root, 'server')).filter(p => p.endsWith('.js'))) {
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) failures.push(syntax.stderr);
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(file), match[1]))) failures.push(`Missing import: ${file}: ${match[1]}`);
  }
}
for (const folder of ['server', 'hrm-client/src']) {
  for (const file of walk(path.join(root, folder)).filter(p => /\.(js|jsx|json)$/.test(p) && !p.includes('/tests/'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (/BEGIN (?:OPENSSH |RSA )?PRIVATE KEY/.test(source)) failures.push(`Private key in ${file}`);
    if (/\.schema\(['"](?:crm|inventory|operations)['"]\)|['"]\/api\/(?:crm|inventory|operations|telegram|webhooks)(?:\/|['"])/.test(source)) failures.push(`Excluded module reference: ${file}`);
  }
}
for (const name of ['.ssh_temp', 'server/modules/crm', 'server/modules/inventory', 'server/modules/operations', 'scripts/seeds']) {
  if (fs.existsSync(path.join(root, name))) failures.push(`Excluded path still present: ${name}`);
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('HR source checks passed: syntax, imports, excluded modules, and current-source key checks.');
