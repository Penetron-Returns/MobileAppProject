# Contributing

`master` is protected. **Nobody pushes to it directly.** Every change goes through a pull request.

## Workflow

1. Update your local master: `git switch master && git pull`
2. Branch off it, named `contributor-name/feature-name`: `git switch -c charl/login-page`. Don't fork the repo.
3. Commit, then push your branch: `git push -u origin HEAD`
4. Open a pull request into `master` on GitHub.
5. CI must pass and one of the leads (@xd-Park3rr or @JpegAndre, see `.github/CODEOWNERS`) must approve. Only the leads can merge.
6. Merge with **Squash and merge**, then delete the branch.

## Rules

- No direct pushes, force-pushes, or branch deletion on `master`. GitHub enforces this with a ruleset, and the Husky `pre-push` hook blocks it locally.
- Keep PRs focused on one change. Don't bundle unrelated work.
- If CI is red, fix it on your branch. Don't merge around it.
- Never commit secrets (`.env`, API keys, Meta tokens). Use `.env.example` for new variables.
