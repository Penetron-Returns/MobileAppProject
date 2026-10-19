# Google Play store listing: Clovie

Status: draft for Colin's review. Facts come from `docs/BUILD_PLAN.md`, `docs/voice.md` and `docs/nerova-connector.md`. Anything not confirmed in the repo is marked **(assumption)**.

Positioning: the listing text is written for salons and barbers first, with beauty parlors named too. The store graphics stay broad ("Your business, managed by Clovie."). Copy is international, in US English, with no country-specific framing.

## Before you paste anything

1. **Application id: resolved.** `apps/mobile/app.config.ts` picks the id per build variant. The EAS `production` profile sets `APP_VARIANT=production`, which resolves to `app.getclovie` (name Clovie, scheme `clovie`), checked with `APP_VARIANT=production npx expo config`. `app.json`'s `si.nerova.booking.dev` is only the local dev build. Upload only `eas build --profile production` builds to Play. The production API needs `NEROVA_APP_ID=app.getclovie`.
2. **Account deletion** now exists in the app (Settings > Delete account) and at `https://getclovie.app/delete-account`; the privacy policy is `https://getclovie.app/privacy`. See `declarations.md` section 9 and `data-safety.md` section 5.

## 1. App details

| Field | Value | Limit |
| --- | --- | --- |
| App name | `Clovie: Salon & Barber Booking` (30 chars, chosen by Colin 2026-10-19) | 30 |
| Default language | English (United States) `en-US` | |
| App or game | App | |
| Free or paid | Free (no in-app purchases, billing is arranged outside the app) | |
| Package name | `app.getclovie` | |

### Short description (max 80 characters)

```
Bookings for salons, barbers and beauty parlors, run by voice and WhatsApp.
```
(75 characters.) Alternative: `The booking app for salons and barbers. Your calendar, clients and WhatsApp.` (76)

### Full description (max 4000 characters)

```
Clovie is the booking app for salons and barbershops, and for beauty parlors too. It keeps your calendar, your clients and your WhatsApp bookings in one calm place, so you can focus on the person in your chair instead of your phone.

Your clients don't need to install anything. They book, reschedule and cancel in WhatsApp, the app they already use. You and your team use Clovie to see the day, add walk-ins and phone bookings, and keep everything in order.

BUILT FOR THE CHAIR

Your day at a glance
See today's appointments, who's next and who has already arrived. Check a client in with one tap.

Calendar
Switch between day, week and month. Move, reschedule or cancel an appointment, and add walk-ins and phone bookings by hand. Clovie only offers times that are really free, so double bookings can't happen.

Clients
Keep names, phone numbers, notes and visit history for every client. Write down their usual cut, color formula or allergy once and see it every time they come in.

Services, hours and team
Set up your services and prices, opening hours, holidays, each stylist's or barber's working hours, breaks and time off. Invite your team by email, as an owner or as staff.

Booking rules
Choose how much notice you need, how late a client may cancel, and the gap you want between appointments.

Reminders and "Did they make it?" checks
Clients get reminders in WhatsApp. After an appointment, Clovie asks you or your stylist, "Did Jake make it?" so your records stay right without paperwork. Clovie never marks a no-show on its own.

CLOVIE, YOUR ASSISTANT

Clovie's AI companion answers questions about your business and can prepare bookings, moves and cancellations. It always asks for your OK before it changes anything, and you can say yes or no out loud.

TALK, DON'T TYPE

Your hands are busy with clippers, brushes and color, so Clovie works by voice and sound:
- Tap the Clovie tile, the home-screen button or the app shortcut and say what you need, for example "my client has arrived".
- Replies can be read aloud, and short sounds tell you when Clovie heard you, is working or is done.
- "Hey Clovie" hands-free listening is optional and off until you turn it on. You choose when it runs: only during opening hours, only while the phone is charging, or both. While it listens, Android shows a notification with Pause and Stop buttons.

YOUR DATA AND PRIVACY

- Your clients' bookings and details are stored for your business only.
- Voice clips are used to turn what you said into text and are not stored.
- You can switch off voice, hands-free listening and notifications at any time in Settings.
- Read our privacy policy at https://getclovie.app/privacy

GOOD TO KNOW

- Clovie needs an internet connection.
- Sign in with your email or your Google account.
- See plans and pricing at https://getclovie.app
- Voice features work best on Android phones with Google's speech services installed.
- Clovie is for business owners and staff aged 18 and over.

Questions? Write to support@nerovasystems.com.
```

Checks against the repo (so nothing here is a claim we cannot back):

| Claim | Source |
| --- | --- |
| Customers book, reschedule, cancel in WhatsApp, no app | `BUILD_PLAN` section 1 and 5. On paid plans the WhatsApp side is handled by Nerova (`BUILD_PLAN` feature table, `companion`); the wording "in WhatsApp" holds for both. |
| Only really free times offered, no double booking | exclusion constraint, live availability (`BUILD_PLAN` section 1, 3) |
| Day/week/month calendar, client check-in, walk-in bookings | `BUILD_PLAN` section 6 |
| Services, hours, holidays, breaks, time off, team by email invite | `BUILD_PLAN` section 3 and 4 (special days, `staff_breaks`, `staff_time_off`, `/v1/team/invitations`) |
| Client notes (cut, color formula, allergy) | client notes field on the client profile; the examples are free-text uses, not separate features |
| Booking rules (notice, cancellation window, buffer) | `booking_rules` in `businesses` |
| Reminders in WhatsApp; "Did X make it?"; never auto no-show | `BUILD_PLAN` Attendance check ("The server never sets no_show on its own"), reminder templates |
| Companion asks OK before changing bookings | `docs/voice.md` approvals, `docs/nerova-connector.md` approval push |
| Tile, widget, shortcut, spoken replies, sound cues | `docs/voice.md` |
| Hands-free opt-in, opening hours/charging, notification with Pause and Stop | `docs/voice.md` ("Off by default", "Pause (1 h)" and "Stop") |
| Voice clips not stored | `docs/BUILD_PLAN.md` voice transcription row ("Audio and transcript are never logged or stored") |

Wording decisions: salons and barbers lead, beauty parlors are named in the first line and the short description. US spelling ("color", "parlors"). No country or hosting region is named (the earlier "EU (Ireland)" line was unverified and is gone). No prices, no "AI-powered" hype, no numbers about time saved, no offline claim, no "free" claim beyond the download. Plans are pointed at getclovie.app instead of described, because pricing is still moving. Update it when pricing is final.

Length: about 3,000 characters, under the 4,000 limit. Recount after any edit.

## 2. Categorisation

| Field | Value |
| --- | --- |
| Category | **Business** (alternative: Productivity. "Beauty" is a category for consumer apps and would attract customers who cannot use this app) |
| Tags (pick from Play's list, up to 5) | Business, Calendar and scheduling, Appointment booking, Productivity, Voice assistants (use the closest ones Play offers; the list is fixed by Play) |
| Content rating | see `declarations.md` |

## 3. Contact details

| Field | Value |
| --- | --- |
| Developer name | Nerova AI Inc. |
| Support email (public) | support@nerovasystems.com |
| Website | https://getclovie.app |
| Phone | optional; Play wants one for the developer account (kept private) **(Colin to supply)** |
| Privacy policy URL | https://getclovie.app/privacy (host `privacy-policy.html` there first; note the app currently links to `https://nerova.si/privacy` in `apps/mobile/src/lib/legal.ts`, update it to match) |

## 4. Graphics

Final files are in `docs/play-store/assets/` (see its README for sources and specs).

| Asset | File |
| --- | --- |
| App icon, 512x512 | `icon-512.png` |
| Feature graphic, 1024x500, no alpha | `feature-graphic.png` ("Your business, managed by Clovie.") |
| Phone screenshots, 1080x1920 | `screenshot-1.png` to `screenshot-4.png` |
| Tablet screenshots | skipped (the app is phone-first) |
| Promo video | skipped for now (Play only takes a YouTube URL) |

Screenshot captions, in order: "Your whole day, at a glance", "Your week, always up to date", "Everything about a booking", "Know every client". Demo data uses US names and dollars, with "Colin" as the owner.

## 5. Release notes ("What's new", max 500 chars, for the first internal release)

```
First test release of Clovie for Android. Calendar, clients, services and team, WhatsApp bookings, and the Clovie voice assistant. Please tell us what feels slow or confusing: support@nerovasystems.com
```

## 6. Open items for Colin

- Replace the plans line when pricing is final.
- Confirm the tags Play actually offers (the tag list is fixed by Play and changes).
- Provide a developer phone number for the account (private).
