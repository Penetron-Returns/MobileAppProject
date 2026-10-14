#!/usr/bin/env node
// Fails when the three places that resolve @booking/* packages drift apart:
//   - apps/api/tsconfig.json `paths`          (tsc, editor)
//   - the Deno import map next to the Edge Function entry (Deno check, test and the hosted bundle)
// Vitest's aliases are derived by pattern in apps/api/vitest.config.ts, so they are not listed here.
// It also checks that the Deno npm pins equal the exact versions in apps/api/package.json.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsconfigPath = resolve(root, 'apps/api/tsconfig.json');
const denoPath = resolve(root, 'packages/database/supabase/functions/api/deno.json');
// Packages only tests import. Deno never loads them, so the import map need not list them.
const TEST_ONLY = new Set(['@booking/testing']);

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const tsPaths = readJson(tsconfigPath).compilerOptions?.paths ?? {};
const denoImports = readJson(denoPath).imports ?? {};

/** name (with a trailing "/" for prefix entries) -> absolute target */
const fromTs = new Map();
for (const [key, [target]] of Object.entries(tsPaths)) {
  if (!key.startsWith('@booking/') || target === undefined) continue;
  fromTs.set(key.endsWith('/*') ? key.slice(0, -1) : key, resolve(dirname(tsconfigPath), target.replace(/\*$/, '')));
}
const fromDeno = new Map();
for (const [key, target] of Object.entries(denoImports)) {
  if (key.startsWith('@booking/')) fromDeno.set(key, resolve(dirname(denoPath), target));
}

const errors = [];
const isTestOnly = (name) => TEST_ONLY.has(name.replace(/\/$/, ''));
for (const [name, target] of fromTs) {
  if (isTestOnly(name)) continue;
  const other = fromDeno.get(name);
  if (other === undefined) errors.push(`tsconfig maps ${name} but the Deno import map does not`);
  else if (other !== target) errors.push(`${name} points at different places: tsconfig ${target}, Deno ${other}`);
}
for (const name of fromDeno.keys()) {
  if (!fromTs.has(name)) errors.push(`the Deno import map maps ${name} but tsconfig paths do not`);
}

const pkg = readJson(resolve(root, 'apps/api/package.json'));
const pinned = { ...pkg.dependencies, ...pkg.devDependencies };
for (const [name, target] of Object.entries(denoImports)) {
  const match = /^npm:(@?[^@]+)@([^/]+)/.exec(target);
  if (!match) continue;
  const [, dep, version] = match;
  if (pinned[dep] !== undefined && pinned[dep] !== version) {
    errors.push(`${name}: Deno pins ${dep}@${version} but apps/api/package.json has ${pinned[dep]}`);
  }
}

if (errors.length > 0) {
  console.error('Import map drift:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log(`Import maps in sync (${fromDeno.size} @booking entries, tsconfig and Deno).`);
