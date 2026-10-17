# v1 delivery plan

Scope: `docs/v1-scope.md` (Free tier, iPhone-designed app shipped on Android first, deterministic WhatsApp).
Status as of 14 Oct 2026.

**Proven working locally:**
- **Infrastructure:** Supabase (8 migrations plus seed), the API, and Clerk sign-in on Android.
- **App:** live Today screen.
- **WhatsApp:** booking end to end with the native Flow (`booking_v2`, published) and the interactive-list fallback.
- **Plan flags.**

Each phase ends with its checks green (`.claude/CLAUDE.md` §5) and an emulator walkthrough with screenshots.

> **Scope change (14 Oct, founder):** the Free / deterministic WhatsApp tier is a **showcase demo only**, run on the
> single test number of the "Booking App Dev" Meta app. There will be no Meta publishing, no App Review, no Embedded Signup and no
> per-salon numbers. The Meta/WhatsApp code will be deleted after the ITMDA3 launch. **The real product is the paid AI
> tiers** (Nerova provides AI and the whole WhatsApp setup). So in Phase 2 below, only what the demo needs stays (2.1
> done; 2.2–2.4 only if the showcase requires them), and a new Phase 6 (AI tiers) becomes the main track after Phase 1.

## Phase 6: AI tiers (the real product)
| # | Task | Done when |
| - | ---- | --------- |
| 6.1 | Implement Nerova's **Booking connector** (MCP v1, contract 2026-10-12, the recommended transport) on our backend: the 10 required tools, with auth, idempotency and tests. Built: `/connector/nerova/mcp`, see [nerova-connector.md](nerova-connector.md) | Nerova's `connections_verify` certifies it against a test account (needs deploy + connection in Nerova Test) |
| 6.2 | Connection + provisioning in Nerova's **Test** environment for a paid-plan business | `get_companion_setup` reports `nextStep: none` |
| 6.3 | Pip in the app: server-side widget session endpoint + the owner chat surface per the AI designs (Companion sheet, approvals, report, goals) | The owner chats with Pip on the emulator and an approval moves a real booking |
| 6.4 | Stripe subscriptions for Starter / Growth / Pro (web checkout), webhook → `businesses.plan`. **Backend built** (not deployed, never run against Stripe): `POST /v1/billing/checkout`, `POST /v1/billing/portal`, `POST /webhooks/stripe`, usage metering to a Stripe Billing Meter (every booking made counts), `account.created` on first activation. No free tier and no trial: new businesses start on plan `none`. See BUILD_PLAN "Billing (Stripe)". Still to do: Dashboard setup, env, app side (plan chooser, Manage subscription, past_due warning) | A test checkout switches a business to the AI tier |
| 6.5 | AI-tier gating: no Inbox, no deterministic WhatsApp engine, Pip everywhere it's designed | A paid business sees the AI app, a Free business the demo |

## Phase 1: make every v1 screen correct on a real device
| # | Task | Done when |
| - | ---- | --------- |
| 1.1 | Fix list from first run: Inbox dome missing on Free; Clerk dev gear overlapping the bell; Android self sign-up ("account not found" with `signInOrUp`) | Dome shows with open-escalation count; nothing overlaps the header; a new email can sign up on Android |
| 1.2 | In-app onboarding: signed-in user with no business creates one (Clerk org + business row, hours, services, staff) without relying on the Clerk webhook | Fresh account → onboarding → lands on Today with its own business |
| 1.3 | Welcome screen + Clerk theming (brand colour, logo, radius, app name instead of "My Application") | First launch shows our designed welcome, then a Clerk screen in our look |
| 1.4 | Restyle the 4 older settings screens (Business details, Hours, Services, Staff) to the depth design | Visual parity with the canvas boards |
| 1.5 | Emulator QA pass of all v1 screens (screens 3–15) against the canvas, with a screenshot each; fix everything found | Every screen screenshot-verified; fix list empty |

## Phase 2: WhatsApp complete
| # | Task | Done when |
| - | ---- | --------- |
| 2.1 | Reschedule + cancel Flows fixed like booking (terminal `complete`), published | Customer reschedules and cancels inside WhatsApp |
| 2.2 | Message templates for confirmations/reminders (outside the 24 h window) created + approved on the test WABA | Templates `APPROVED` |
| 2.3 | Reminders: pg_cron → `/cron/*` with Vault secrets locally and hosted | A booking tomorrow gets a reminder |
| 2.4 | Inbox / escalation loop: 3-strike escalation → Inbox → staff reply → release to bot | Verified on a real phone |

## Phase 3: shared hosted environment (friends can use it)
| # | Task | Done when |
| - | ---- | --------- |
| 3.1 | Supabase dev project + `db push` + secrets + `functions deploy api` (needs Supabase access token) | `/health` OK on the hosted URL |
| 3.2 | Stable webhooks: Clerk webhook and Meta webhook + Flow endpoint on the hosted URL (retire the tunnel) | Org created in Clerk → business appears; WhatsApp works with laptop off |
| 3.3 | EAS: `eas init`, EAS env vars, `preview` APK build (needs Expo login) | Install link works on a friend's Android |
| 3.4 | Doppler `booking/dev` for developers (needs Doppler account) | `npm run dev:api` works for a second developer |
| 3.5 | Push notifications (EAS projectId, device tokens) | New WhatsApp booking → push on the phone |

## Phase 4: plans and billing (paid tiers)
| # | Task | Done when |
| - | ---- | --------- |
| 4.1 | Stripe products/prices for Starter/Growth/Pro (test mode) + webhook → `businesses.plan`. **Code done and unit-tested with fakes;** the sandbox products, prices and meter exist (ids in `docs/environments.md` §3). Open: webhook endpoint registration + a real test checkout once deployed | Test checkout flips the plan; entitlements update |
| 4.2 | Where people pay: a hosted Stripe Checkout/Portal link opened from Plan & billing (see decision D2). **Backend done** (D2 followed: web checkout, the app opens `checkout_url` / `portal_url` in the browser). Open: the app screens, the portal configuration in the Dashboard | Upgrade/downgrade/cancel work in test mode |

## Phase 5: showcase and quality
| # | Task | Done when |
| - | ---- | --------- |
| 5.1 | Research metrics: `booking_attempts` captured for WhatsApp (steps, timings) + a simple export | CSV of attempts for the report |
| 5.2 | Security + accessibility review (backend-reviewer, frontend-reviewer agents), fixes | No high findings open |
| 5.3 | PRs: #4 then `colin/v1` → `main`, reviewed by Andre | Merged, CI green |

## Decisions needed from Colin
- **D1 – research comparator.** ITMDA3's research question compares WhatsApp booking against a web booking
  page, but the product rule is "no web booking page". Options: (a) a minimal, unlinked comparator page used only
  for the study; (b) compare WhatsApp Flow vs interactive lists instead. Recommendation: (b) if the lecturers accept
  it, otherwise (a) kept out of the product.
- **D2 – where subscriptions are bought.** Google Play and the App Store restrict selling digital subscriptions
  inside apps outside their billing. Recommendation: sell on the web (Stripe Checkout) and have the app show the plan
  and link to manage it where store rules allow.
- **D3 – real WhatsApp identity.** The test number shows "Nerova Systems". For friends, use a dedicated number or a
  separate Meta business portfolio for the booking app.
- **D4 – app name and brand colour** (still placeholders).

## Accounts / access Colin provides
Supabase access token or a created `booking-dev` project (3.1), Expo login (3.3), Doppler (3.4), Stripe test keys in
the env (4.1). Everything else is done by agents.
