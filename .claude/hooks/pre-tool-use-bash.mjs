#!/usr/bin/env node
// PreToolUse hook for Bash: blocks commands that bypass the PR workflow or destroy shared state.
// Exit code 2 blocks the call and feeds stderr back to Claude.
import { execSync } from 'node:child_process';

const input = JSON.parse(await new Promise((resolve) => {
  let data = '';
  process.stdin.on('data', (chunk) => (data += chunk));
  process.stdin.on('end', () => resolve(data || '{}'));
}));
// Strip quoted strings (commit messages, echo text) so flags are only matched where they are real arguments.
const cmd = String(input?.tool_input?.command ?? '')
  .replace(/"(?:\\.|[^"\\])*"/g, '""')
  .replace(/'[^']*'/g, "''");

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: process.env.CLAUDE_PROJECT_DIR, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const checks = [
  {
    test: () => /\bgit\s+push\b[^;&|]*(\s|:)(master|main)(\s|$)/.test(cmd),
    reason: 'Direct pushes to master are not allowed. Push a feature branch and open a pull request (see CONTRIBUTING.md).',
  },
  {
    test: () => /\bgit\s+push\s*($|[;&|])/.test(cmd) && ['master', 'main'].includes(currentBranch()),
    reason: 'You are on master. Create a branch (`git switch -c <contributor-name>/<feature-name>`) and push that instead.',
  },
  {
    test: () => /\bgit\s+push\b[^;&|]*\s(--force(?!-with-lease)|-f)(\s|$)/.test(cmd),
    reason: 'Plain force-push is blocked. Use --force-with-lease, and only on a branch you own.',
  },
  {
    test: () => /\bgit\s+(commit|push|merge|rebase)\b[^;&|]*--no-verify/.test(cmd),
    reason: '--no-verify skips the repo hooks. Fix the failing check instead.',
  },
  {
    test: () => /\bsupabase\s+db\s+reset\b[^;&|]*--linked/.test(cmd),
    reason: '`supabase db reset --linked` wipes a hosted database. Reset only the local stack.',
  },
];

for (const check of checks) {
  if (check.test()) {
    console.error(`❌ ${check.reason}`);
    process.exit(2);
  }
}
process.exit(0);
