# MCP servers

The repo ships project-scoped MCP config so every teammate's AI tooling talks to the same services:

| File | Client |
| --- | --- |
| `.mcp.json` | Claude Code |
| `.vscode/mcp.json` | VS Code (Copilot agent mode) |
| `.cursor/mcp.json` | Cursor |

No secrets are committed. Remote servers authenticate with OAuth in the client. Local servers read tokens from your environment.

## Servers

| Name | Transport | What we use it for | Auth |
| --- | --- | --- | --- |
| `metadev-tools` | HTTP `https://mcp.facebook.com/devtools` | Meta Developer Tools: app review status, compliance, webhook config of our Meta app (WhatsApp Cloud API) | OAuth with your Meta developer account |
| `clerk` | HTTP `https://mcp.clerk.com/mcp` | Up-to-date Clerk SDK snippets and patterns (Expo + backend) | None/OAuth per Clerk docs |
| `shadcn` | stdio `npx shadcn@latest mcp` | Browse and install UI components. It reads `apps/mobile/components.json`, which points at the react-native-reusables registry | None |
| `stripe` | HTTP `https://mcp.stripe.com/` | Payments work (not built yet). Customers, products, payment links in **test mode** | OAuth (pick the test-mode account) |
| `supabase` *(optional)* | stdio `@supabase/mcp-server-supabase --read-only` | Inspect the schema, run read-only SQL, read logs | `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` |

## Setup (Claude Code)

1. Open the repo in Claude Code. It asks once to approve the project MCP servers, so accept them.
2. Run `/mcp`, select each HTTP server (`metadev-tools`, `clerk`, `stripe`) and complete the OAuth flow in the browser.
3. For Supabase, export before starting Claude Code:
   ```bash
   export SUPABASE_PROJECT_REF=<dev project ref>
   export SUPABASE_ACCESS_TOKEN=<personal access token from supabase.com/dashboard/account/tokens>
   ```
4. Verify with `claude mcp list` (all should show ✓ connected).

VS Code prompts for the Supabase values via `inputs`. Cursor reads them from your shell environment (`${env:…}`).

## Safety rules

- **Stripe:** connect the **test-mode** account only. If you use a key instead of OAuth, create a *restricted* key with the minimum permissions. Never use a live secret key with an agent.
- **Supabase:** always point it at the **dev** project. It's `--read-only`; all writes go through migrations in `packages/database/supabase/migrations`.
- **Meta:** the Developer Tools MCP can change one app setting. Review any write it proposes before approving it.
- Never paste tokens into `.mcp.json`. Use environment variables.

## Sources

- Meta Developer Tools MCP: https://developers.facebook.com/documentation/mcp/devtools-mcp
- Clerk MCP server: https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server
- shadcn MCP: https://ui.shadcn.com/docs/mcp
- Stripe MCP: https://docs.stripe.com/mcp
- Supabase MCP: https://supabase.com/docs/guides/getting-started/mcp
