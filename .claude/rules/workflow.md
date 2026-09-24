# Git and change workflow

- Never push to `master`. Work on a branch (`<name>/<change>`), open a PR, get a lead's approval (see `.github/CODEOWNERS` and `CONTRIBUTING.md`).
- Never force-push shared branches, rewrite others' history, or use `--no-verify` to get around failing checks.
- Keep PRs focused: one feature or fix. Unrelated cleanups go in their own PR.
- Before pushing, run the checks for every area you touched (see `CLAUDE.md` → Commands) and make sure they pass.
- Commit messages: imperative summary ≤ 72 chars, a body that explains why when it isn't obvious.
- Contract changes (DB schema, RPC signatures, API routes/DTOs, conversation states) update `docs/BUILD_PLAN.md` and every consumer in the same PR.
- Dependencies: add one only when it clearly pays for itself, and say why in the PR. Use `npx expo install` for Expo-managed packages.
