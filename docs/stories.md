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
