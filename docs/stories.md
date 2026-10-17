# Clovie stories

Instagram-style stories at the top of the Clovie tab: **Brief**, **Client updates**, **Business update**, **Product updates**. This note records how they are generated. Design: the canvas page "Clovie tab", row "C · One moment".

## Principles

- Every number comes from our own data, and the wording comes from fixed templates. No model writes facts at runtime.
- Tone (positive, neutral, attention, concern) is set by deterministic thresholds. It drives the ring and card colours and Clovie's pose.
- A story with nothing in it is not shown, and neither is a card with nothing in it ("0 new clients" never appears).
- New and viewed state is tracked per person, so each staff member has their own rings.

## Brief, Client updates, Business update

| Story | When it is generated | Cards (in order, only those with content) |
|---|---|---|
| Brief | Daily, 30 min before opening (business timezone) | today's bookings and the first client; the busiest window; unconfirmed clients; revenue booked today |
| Client updates | Mondays, plus whenever a new client or feedback arrives | new clients; clients not returned vs the previous month; clients who came back (with a short list); feedback (quotes, rating) |
| Business update | Weekly, plus month-end | revenue booked vs the previous period; no-shows; the most popular service |

- A server job builds each story from pure aggregation functions over appointments and clients (inject `now` and the timezone), then stores it as a row: business, kind, period, cards (json), tone, created_at.
- Tone examples:
  - "not returned" is attention when it rose vs the previous period;
  - feedback with 3 stars or fewer is attention;
  - a no-show is concern;
  - growth is positive.
- Feedback depends on Nerova collecting post-visit feedback on WhatsApp. Until then the feedback card is omitted.

## Product updates

The source is a structured changelog. Raw commits are not used.

- Each release adds owner-friendly entries: an id, a release date, a short title and a one-line body in plain words.
- Each entry carries tags:
  - plan tiers (free, starter, growth, pro);
  - role (owner, staff);
  - required setup, e.g. `voice`, `whatsapp_connected`, `companion`, `act_then_undo`;
  - platforms;
  - the minimum app version.
- Claude drafts the entries at each release, and Colin approves or edits them before they go live (to begin with; this may become automatic later).
- Nerova's own improvements come from a Nerova product-updates feed with the same tags, merged in.
- Entries live on the server, so publishing needs no app update. An entry only appears once its feature is live for that business.

Selection per person:
1. The plan includes it.
2. The role matches.
3. The setup supports it.
4. The installed app version includes it.
5. The person has not seen it yet.

Show at most 3 cards, newest first.

## Implementation notes

Code: `packages/features/stories/` (aggregators, `lib/schedule.ts`, job, repositories, `strings.ts`), routes in `apps/api/src/routes/v1/stories.ts`, job `/cron/stories` (every 15 minutes, migration `20261027000003`), tables in migrations `20261027000001` (stories) and `20261027000002` (product updates, seeded). Contract: `docs/BUILD_PLAN.md` (Stories).

### Definitions

- **Period of Client updates and the Business update:** the last 7 days, `(now - 7d, now]`, against the 7 days before. A Monday run therefore reports the week just finished. The story's key is the ISO week it was generated in (`2026-W42`). The month-end Business update compares the calendar month so far with the whole previous month (key `2026-10`); when a Monday is also the last day of the month, the month-end one is built.
- **Brief:** appointments starting on the business-local day of `now`, not cancelled. Revenue is confirmed plus completed bookings at the service price in integer cents (shown as `R2,450`). The busiest window is the 2-hour block, anchored on the hour of a booking start, with the most bookings (earliest on a tie); it needs 2 or more bookings.
- **Not returned (lapsed):** last completed visit more than 6 weeks before the instant, and no non-cancelled booking made by then for after it. The count now is compared with the count 30 days ago, evaluated at that instant (only visits and bookings that existed then). Attention when it rose. History is read for 365 days.
- **Came back:** a completed visit in the period at least 5 weeks after that client's previous completed visit.
- **Feedback card:** omitted. The hook is `buildFeedbackCard` in `aggregators/clients.ts`.
- **Story tone:** the highest severity of its cards (concern, attention, neutral, positive), except that when its worst card is only attention and more than half of the cards are positive the story is neutral. A concern card always wins.
- **Card emotion:** positive is proud or delighted (alternating by position), neutral curious, attention thoughtful, concern sympathetic, product updates presenter.

### Generation

- Brief: created in the 30 minutes before the earliest `business_hours.opens_at` of the local weekday (a closed day has none; special days are not consulted). Client updates: Mondays. Business update: Mondays and the last day of the month.
- An existing Brief or Client updates story is regenerated when older than 15 minutes, and only written when its tone or cards changed (the story id and everyone's viewed state stay). A story that becomes empty is deleted. A story is never created outside its slot, so a Brief that was empty at opening is not created later in the day.
- Brief expires at the end of the local day, the others 8 days after the day they were built. `GET /v1/stories` serves the newest unexpired story per kind.

### API behaviour to know

- Product updates are filtered per caller: approved, released, plan, role, platform, setup flags, `minAppVersion` (numeric semver compare; hidden when the app sends no version) and not seen. At most 3, newest first. Setup: `companion` is the plan feature; `act_then_undo` is treated as available with `companion` (the approval policy lives at Nerova and is not read here); `voice` follows `VOICE_CLOUD_STT`. Because seen entries are dropped, `productUpdates.viewed` is false whenever there are cards.
- Product update cards carry `demo` (the client-side demo id) in addition to the shared card shape.
- The `Idempotency-Key` rule applies to the three POST routes. Analytics events carry ids, a kind, a card index and an event name only (strict schema), so no personal data can be sent.
