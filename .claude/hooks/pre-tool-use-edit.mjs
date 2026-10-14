#!/usr/bin/env node
// PreToolUse hook for Edit/Write/MultiEdit: protects generated files, merged migrations and secrets.
// Exit code 2 blocks the call and feeds stderr back to Claude.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', (chunk) => (data += chunk));
  process.stdin.on('end', () => resolve(data || '{}'));
}));
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const filePath = String(input?.tool_input?.file_path ?? input?.tool_input?.notebook_path ?? '');
const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');

function block(reason) {
  console.error(`❌ ${reason}`);
  process.exit(2);
}

function existsOnMaster(file) {
  try {
    execFileSync('git', ['cat-file', '-e', `origin/master:${file}`], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (rel === 'packages/database/database.types.ts') {
  block('packages/database/database.types.ts is generated. Change a migration and run scripts/db/gen-types.sh.');
}
// Until the restructure lands on master, merged migrations still live under supabase/migrations/ there.
const legacyRel = `supabase/migrations/${path.posix.basename(rel)}`;
if (/^packages\/database\/supabase\/migrations\/[^/]+\.sql$/.test(rel) && (existsOnMaster(rel) || existsOnMaster(legacyRel))) {
  block(`${rel} is already merged. Migrations are append-only, so create a new migration file instead.`);
}
if (/(^|\/)\.env(\.[\w-]+)?$/.test(rel) && !rel.endsWith('.env.example')) {
  block('Do not write secrets files. Document variables in .env.example and let the developer fill in .env.');
}
process.exit(0);
