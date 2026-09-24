#!/usr/bin/env node
// Rewrites extensionless relative imports to explicit `.ts` paths so the backend runs unchanged
// under Deno (Supabase Edge Functions) as well as Node/Vitest. Idempotent; safe to re-run.
// Usage: node scripts/add-import-extensions.mjs [dir ...]   (defaults: src test)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'test'];
const SPEC = /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

function resolveSpecifier(fromFile, spec) {
  if (/\.(ts|mts|js|mjs|json)$/.test(spec)) return spec;
  const base = path.resolve(path.dirname(fromFile), spec);
  if (existsSync(`${base}.ts`)) return `${spec}.ts`;
  if (existsSync(path.join(base, 'index.ts'))) return `${spec.replace(/\/$/, '')}/index.ts`;
  return spec;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

let changed = 0;
for (const root of roots) {
  if (!existsSync(root)) continue;
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8');
    const next = source.replace(SPEC, (m, pre, q, spec) => `${pre}${q}${resolveSpecifier(file, spec)}${q}`);
    if (next !== source) {
      writeFileSync(file, next);
      changed += 1;
    }
  }
}
console.log(`add-import-extensions: updated ${changed} file(s)`);
