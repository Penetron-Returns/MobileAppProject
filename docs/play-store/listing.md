# Google Play store listing: Clovie

Status: draft for Colin's review. Facts come from `docs/BUILD_PLAN.md`, `docs/voice.md` and `docs/nerova-connector.md`. Anything not confirmed in the repo is marked **(assumption)**.

## Before you paste anything: two blockers found in the repo

1. **Application id mismatch.** `apps/mobile/app.json` still has `android.package = "si.nerova.booking.dev"` (and the iOS bundle id is the same). Play needs `app.getclovie`. The id cannot be changed after the first upload, so change `android.package` (and the `eas.json` / Nerova `NEROVA_APP_ID` registration that refers to `si.nerova.booking.dev`) **before** the first build you upload. I did not touch code, as instructed.
2. **Account deletion** now exists in the app (Settings > Delete account) and at `https://getclovie.app/delete-account`; the privacy policy is `https://getclovie.app/privacy`. See `declarations.md` section 9 and `data-safety.md` section 5.

## 1. App details

| Field | Value | Limit |
| --- | --- | --- |
| App name | `Clovie: Salon Bookings` (22 chars) | 30 |
| Fallback name if rejected | `Clovie` | 30 |
| Default language | English (South Africa) `en-ZA`. Add English (United Kingdom) only if Play will not accept en-ZA for the listing. | |
| App or game | App | |
| Free or paid | Free (no in-app purchases, billing is arranged outside the app) | |
| Package name | `app.getclovie` | |

### Short description (max 80 characters)

```
Run your salon day by voice: calendar, clients and WhatsApp bookings.
```
(69 characters.) Alternative: `Your salon's calendar and clients, with a voice assistant that helps.` (69)

### Full description (max 4000 characters)

```
Clovie is a booking app for salons and barbershops in South Africa. It keeps your calendar, your clients and your WhatsApp bookings in one calm place, so you can spend the day with the person in your chair instead of with your phone.

Your customers do not need to install anything. They book, reschedule and cancel in WhatsApp, the app they already use. You and your team use Clovie to see the day, add walk-ins and phone bookings, and keep everything in order.

WHAT YOU CAN DO

Your day at a glance
See today's appointments, who is next and who has already arrived. Check a client in with one tap.

Calendar
Switch between day, week and month. Move, reschedule or cancel an appointment, and add a booking by hand for walk-ins and phone calls. The app only offers times that are really free, so double bookings cannot happen.

Clients
Keep names, phone numbers, notes and booking history for every client. Add a note once and see it every time they come in.

Services, hours and staff
Set up your services and prices, your opening hours, public holidays, staff working hours, breaks and time off. Add your team by email invitation, as an owner or as staff.

Booking rules
Choose how much notice you need, how late a client may cancel, and the gap you want between appointments.

Reminders and "Did they make it?" checks
Clients get reminders in WhatsApp. After an appointment, Clovie asks you or the stylist, "Did Sipho make it?" so your records stay right without paperwork. Clovie never marks a no-show on its own.

CLOVIE, YOUR ASSISTANT

Clovie is an AI companion (on supported plans) that answers questions about your business and can prepare bookings, moves and cancellations. It always asks for your OK before it changes anything. You can say yes or no out loud.

TALK, DON'T TYPE

Not everyone likes reading small text, and your hands are often busy. Clovie was designed so you can use it by voice and sound:
- Tap the Clovie tile, the home-screen button or the app shortcut and say what you need, for example "client has arrived".
- Replies can be read aloud, and short sounds tell you when Clovie heard you, is working or is done.
- "Hey Clovie" hands-free listening is optional and switched off until you turn it on. You choose when it runs: only during your opening hours, only while the phone is charging, or both. While it is listening, Android shows a notification with Pause and Stop buttons.

YOUR DATA AND PRIVACY

- Customers' bookings and details are stored for your business only, on servers in the EU (Ireland).
- Voice clips are used to turn what you said into text and are not stored.
- You can switch off voice, hands-free listening and notifications at any time in Settings.
- Read our privacy policy at https://getclovie.app/privacy

GOOD TO KNOW

- Clovie needs an internet connection.
- Sign in with your email or your Google account.
- The AI companion is part of paid plans. Ask your account contact or visit https://getclovie.app for details.
- Voice features are available on Android phones. A phone that has Google's speech pack installed works best.
- Clovie is for business owners and staff aged 18 and over.

Questions? Write to support@nerovasystems.com.
```

Checks against the repo (so nothing here is a claim we cannot back):

| Claim | Source |
| --- | --- |
| Customers book, reschedule, cancel in WhatsApp, no app | `BUILD_PLAN` section 1 and 5 (deterministic WhatsApp engine). Note: on paid plans the WhatsApp side is handled by Nerova (`BUILD_PLAN` feature table, `companion`); the wording "in WhatsApp" holds for both. |
| Only really free times offered, no double booking | exclusion constraint, live availability (`BUILD_PLAN` section 1, 3) |
| Day/week/month calendar, client check-in, walk-in bookings | `BUILD_PLAN` section 6 |
| Services, hours, public holidays, breaks, time off, team by email invite | `BUILD_PLAN` section 3 and 4 (special days, `staff_breaks`, `staff_time_off`, `/v1/team/invitations`) |
| Booking rules (notice, cancellation window, buffer) | `booking_rules` in `businesses` |
| Reminders in WhatsApp; "Did X make it?"; never auto no-show | `BUILD_PLAN` Attendance check ("The server never sets no_show on its own"), reminder templates |
| Companion asks OK before changing bookings | `docs/voice.md` approvals, `docs/nerova-connector.md` approval push |
| Tile, widget, shortcut, spoken replies, sound cues | `docs/voice.md` |
| Hands-free opt-in, opening hours/charging, notification with Pause and Stop | `docs/voice.md` ("Off by default", "Pause (1 h)" and "Stop") |
| Voice clips not stored | `docs/BUILD_PLAN.md` voice transcription row ("Audio and transcript are never logged or stored"); matches your brief |
| EU (Ireland) hosting | your brief **(assumption: not stated in the repo; confirm the Supabase project region)** |
| Voice only on Android | `docs/voice.md` (iOS reports not supported) |

Wording decisions: no prices, no "AI-powered" hype, no numbers about time saved (we have no data to back them), no claim that it works offline, no "free" claim beyond the app download being free. The "paid plans" sentence is deliberately vague because the pricing model is still moving (`BUILD_PLAN` section 6 describes Free and paid tiers; your notes say Free is to be removed after the showcase). Update it when pricing is final.

Length: about 3,000 characters, under the 4,000 limit. Recount after any edit.

## 2. Categorisation

| Field | Value |
| --- | --- |
| Category | **Business** (alternative: Productivity. Business fits an owner tool; "Beauty" is a category for consumer apps and would attract customers who cannot use this app) |
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

## 4. Graphics specs

| Asset | Spec |
| --- | --- |
| App icon | 512x512 PNG, 32-bit, max 1 MB. Source: `apps/mobile/src/assets/images/icon.png` (check it is 512 or larger, no rounded corners baked in; Play rounds it) |
| Feature graphic | 1024x500 JPG or 24-bit PNG, no transparency |
| Phone screenshots | 2 to 8, 16:9 or 9:16, each side 320 to 3840 px. We use 8 at 1080x1920 (or 1080x2400) |
| 7-inch / 10-inch tablet screenshots | optional; skip for now (the app is phone-first) |

## 5. Screenshot shot list (phone, 8 shots)

Take them on a real or emulated Android phone with the demo data from a salon-style seed (invent names: Thandi, Sipho, Lerato; no real customers, no real phone numbers). Use light mode for all except shot 6 (dark, to show the overlay). Put a short caption in Clovie's blue on a pale background above the phone frame (max 6 words, plain English). Frame with a simple device mockup; keep the status bar clean (full battery, 09:41, no notifications).

| # | Caption | What it shows | Screen in the repo |
| --- | --- | --- | --- |
| 1 | Your whole day, at a glance | Today tab: next client card with Check in, "Later today" list, an "attendance needs" card showing one "Did Thandi make it?" | `src/app/(app)/(tabs)/index.tsx` (`features/today`: `UpNextCard`, `LaterToday`, `AttendanceNeeds`) |
| 2 | Only times that are really free | Calendar day view with 5 to 6 colour-coded appointments for two stylists | `src/app/(app)/(tabs)/calendar.tsx` |
| 3 | Add a walk-in in seconds | New booking screen: client chosen, service, date, a row of live time slots, staff | `src/app/(app)/new-booking.tsx` |
| 4 | Everything about a booking | Booking detail: client, service, time, status actions, reschedule and cancel | `src/app/(app)/bookings/[id].tsx` |
| 5 | Know every client | Client profile with contact, an "Important note" (for example a colour allergy reminder, written by us), and history | `src/app/(app)/clients/[id].tsx` |
| 6 | Just say it | The voice overlay over the home screen (the "VoiceWake" overlay) showing "Checked in Sipho"; set the phone in dark mode | overlay in `modules/clovie-voice/overlay/`, captured from the device while the real overlay is up (needs the "Display over other apps" permission) |
| 7 | Clovie asks before it acts | Companion sheet with a booking approval card ("Book Lerato, Gel manicure, Fri 16 Oct 20:30") with Approve and Decline | `src/app/(app)/companion.tsx` (`features/companion`, `features/approvals`) |
| 8 | Set it up your way | Settings list showing Business details, Operating hours, Services, Staff, Clovie voice | `src/app/(app)/(tabs)/settings.tsx` and `settings/voice.tsx` (the "Clovie voice" screen with the one-tap and hands-free sections) |

Notes for the shoot:
- Shot 6 is hardest. Capture it from a real phone with the dev/preview build; the emulator has no wake word or microphone path.
- Shot 7 needs a paid-plan test business with the Nerova companion provisioned (`companion` feature). Check `get_companion_setup` says `nextStep: none` first.
- Avoid showing any screen with a real WhatsApp number or client; Play can reject screenshots that reveal personal data.
- Do not show an "AI" badge or claims on screenshots beyond what the app actually displays.
- The Reports tab and plan screens are left out on purpose (pricing is not final).

## 6. Feature graphic brief (1024x500)

- **Goal:** one calm, premium image that says "salon day, handled" without words doing the work.
- **Mascot:** Clovie's blue clover icon (use the real artwork from `icon.png` / the brand assets in `features/brand`; do not redraw it). Place it left of centre at about 45% of the image height, soft shadow, slightly lifted (the "Depth" look from `docs/design-language.md`).
- **Background:** a soft, pale blue to white gradient (the adaptive-icon background colour is `#d4e9f4`, start there). No stock photos of people (we cannot show customers' consent, and it ages badly). A faint, out-of-focus warm salon-light blur on the far right is acceptable.
- **Right side:** one phone mockup, slightly tilted, showing the Today screen (shot 1), cropped by the bottom edge so it feels like it rises into the frame.
- **Text (optional, keep to one line, large, rounded sans-serif like the app):** `Your salon day, by voice.` Nothing else. No store badges, no "Free", no "#1", no prices, no award language (Play rejects those).
- **Safe zone:** keep all important content inside the central 924x400, because Play crops the edges on some surfaces and overlays a play button on promo videos.
- **Mood:** calm, quiet, generous space, Apple-like restraint. No sparkles, no robot imagery, no chat bubbles with "AI".
- **Deliver:** PNG or JPG, 1024x500, under 15 MB, no transparency.

## 7. Release notes ("What's new", max 500 chars, for the first internal release)

```
First test release of Clovie for Android. Calendar, clients, services and staff, WhatsApp bookings, and the Clovie voice assistant. Please tell us what feels slow or confusing: support@nerovasystems.com
```

## 8. Open items for Colin

- Confirm `en-ZA` is accepted as the store language, else use `en-GB` text (the copy already uses South African usage).
- Replace the "paid plans" sentence when pricing is final.
- Confirm the tags Play actually offers (the tag list is fixed by Play and changes).
- Provide a developer phone number for the account (private).
