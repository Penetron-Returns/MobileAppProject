---
paths: .claude/**,AGENTS.md
description: Conventions for creating and updating AI rules, agents, skills, hooks and settings
---

# AI Rules

Guidelines for the AI configuration in `.claude/`. `.claude/` is the source of truth; `AGENTS.md` mirrors `.claude/CLAUDE.md` for other AI tools (run `node scripts/sync-ai-rules.mjs` after editing it).

## Implementation

1. Place files in the right directory:
   - `.claude/CLAUDE.md`: project overview, spec summary, stack, commands (≤ 200 lines)
   - `.claude/rules/<area>/`: coding standards. Areas: `general` (always on), `frontend`, `backend`, `infrastructure`, `ai-rules`
   - `.claude/agents/`: subagent definitions (role, boundaries, workflow)
   - `.claude/skills/`: workflow skills (ours) and vetted third-party skills (see `docs/skills.md`)
   - `.claude/hooks/`: Node scripts (`.mjs`) so they run on every OS. Wire them in `.claude/settings.json`
2. Use this frontmatter for rules:
   - `paths:` comma-separated globs for conditional loading. Be specific (`backend/src/whatsapp/**/*.ts`, not `**/*.ts`). Omit it only for rules that must always load (`general/`)
   - `description:` one self-contained line
3. Structure every rule the same way:
   - `# Title` matching the filename, then a one-paragraph overview
   - `## Implementation` with numbered steps that start with a directive verb (Use, Create, Never …)
   - `## Examples` with `// ✅ DO:` and `// ❌ DON'T:` code, using `### Example 1 - <topic>` for several
4. Keep rules short and specific to this codebase. Link to real files (`[container.ts](/backend/src/container.ts)`) instead of restating them. Generic advice belongs in skills, not rules.
5. Keep one topic per file. When a rule grows past ~150 lines, split it.
6. Change a rule in the same PR as the code convention it describes.

## Examples

### Example 1 - Rule Frontmatter

```markdown
// ✅ DO: specific paths, one-line description
---
paths: backend/src/routes/**/*.ts
description: Rules for Hono route handlers, validation and response envelopes
---

// ❌ DON'T: match everything, or omit the description
---
paths: **/*
---
```
