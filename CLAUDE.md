# Booking platform: project guide for Claude

Deterministic WhatsApp booking platform for small service businesses (ITMDA3, group S14).
Customers book over WhatsApp. Owners and staff run the business in the Expo app.

- **Spec and contracts:** `docs/BUILD_PLAN.md` is binding. Change it in the same PR as any contract change.
- **Layout:** `src/` Expo app · `backend/` Hono API on Vercel · `supabase/` migrations/seed/SQL tests · `shared/` types-only contracts · `docs/` design notes.
- **Rules:** `.claude/rules/`. Engineering principles, architecture, security, testing and workflow always apply. Stack-specific rules load when you touch those files.
- **Skills:** `.claude/skills/` (see `docs/skills.md`). Use them for UI/UX, React/RN, Expo, Supabase, Clerk, Stripe and WhatsApp work.
- **MCP:** `.mcp.json` (see `docs/mcp.md`).

## Commands
| Area | Check |
| --- | --- |
| App | `npm run lint && npx tsc --noEmit && npm run test:no-watch` |
| Backend | `cd backend && npx tsc --noEmit && npx vitest run` |
| Database | `scripts/db/test.sh` (throwaway Postgres 16, migrations, seed, SQL tests, generated-types check) |
| DB types | `scripts/db/gen-types.sh` after any migration change |

Run the checks for every area you touched before saying work is done.
