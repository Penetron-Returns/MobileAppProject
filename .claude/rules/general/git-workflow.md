---
description: Branching, commits, pull requests and contract-change discipline (always loaded)
---

# Git Workflow

`master` only changes through reviewed pull requests. See [CONTRIBUTING.md](/CONTRIBUTING.md).

## Implementation

1. Never push to `master`. Work on `<name>/<change>` branches and open a PR, approved by @xd-Park3rr or @JpegAndre.
2. Never force-push shared branches, rewrite others' history, or use `--no-verify`. The Bash hook blocks these.
3. Never commit, amend or push unless the user asked for it in this conversation.
4. Keep PRs focused on one feature or fix.
5. Run the checks for every area you touched (see `.claude/CLAUDE.md` → Commands) before pushing.
6. Write an imperative summary line of ≤ 72 chars, with a short body explaining why when it isn't obvious.
7. Update [BUILD_PLAN.md](/docs/BUILD_PLAN.md) and every consumer in the same PR as any contract change (schema, RPC, API route/DTO, conversation state).
8. Add a dependency only when it clearly pays for itself, and say why in the PR. Use `npx expo install` for Expo-managed packages.

## Examples

```bash
# ✅ DO
git switch -c andre/client-notes && git push -u origin HEAD

# ❌ DON'T
git push origin master
git commit --no-verify -m "wip"
```
