#!/usr/bin/env node
// Mirrors .claude/CLAUDE.md into AGENTS.md so non-Claude AI tools read the same project guide.
// .claude/ is the source of truth; never edit AGENTS.md directly.
import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../.claude/CLAUDE.md', import.meta.url), 'utf8');
const header = '<!-- GENERATED from .claude/CLAUDE.md by scripts/sync-ai-rules.mjs. Do not edit. -->\n\n';
writeFileSync(new URL('../AGENTS.md', import.meta.url), header + source);
console.log('AGENTS.md synced from .claude/CLAUDE.md');
