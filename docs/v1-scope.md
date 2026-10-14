# v1 build scope

v1 is the first version friends can use on Android, and it is also the ITMDA3 showcase. It covers the Free tier:
deterministic WhatsApp booking plus the owner app. AI (Pip) screens wait for Nerova's host-integration work. The
approved designs are the iPhone artboards on the design canvas
(https://claude.ai/artifact/Bwzwj7MMaPrBcoiwGrXqbF). Anything not listed here stays on the canvas as roadmap.

## Screens in v1

| # | Screen | Design board | Notes |
| - | ------ | ------------ | ----- |
| 1 | Sign in | SignIn | Clerk prebuilt UI (already wired) |
| 2 | Create business | Onboarding | Name, hours, services, staff; creates the Clerk org + business |
| 3 | Today | Main, MainEmpty | Done in PR #4 (live data, check-in) |
| 4 | Calendar: day | CalendarDay | Staff columns, now line, tap a booking → detail. **No drag/resize/sweep in v1** |
| 5 | Calendar: week | CalendarWeek | Read-only overview, tap a day → day view |
| 6 | Booking detail | BookingDetail | Check in, Message (WhatsApp deep link), Reschedule, Cancel |
| 7 | Reschedule | Reschedule | Day + time chips from live availability |
| 8 | Cancel | CancelBooking | Reason, optional WhatsApp message |
| 9 | New booking | NewBooking | Client (search or new), service, staff or "Any", date, live time chips, confirm |
| 10 | Clients | Clients, ClientsEmpty | Search, All / Recent / Regulars |
| 11 | Client profile | ClientProfile | Contact, upcoming, history, notes |
| 12 | Inbox | Inbox, InboxEmpty | Conversations + escalations (Free plan only, gated by `inbox`) |
| 13 | Conversation | Conversation | Reply / release to bot |
| 14 | Settings | Settings | Business, Hours, Services, Team, Booking rules, WhatsApp, Notifications, Sign out |
| 15 | States | OfflineToday, OfflineBlocked, ErrorScreen, SlotTaken | Shared components, used by every screen |

Settings sub-screens in v1: BusinessDetails, HoursSettings, ServicesSettings, StaffSettings, BookingRules,
WhatsAppSettings + WhatsAppDetail, NotificationSettings.

## Not in v1 (stays on the canvas)
- **AI and plans:** Pip / companion screens, Pip report and goals, approve-all.
- **Calendar extras:** month view, Staff | Chairs lens, drag / resize / sweep-to-create.
- **System surfaces:** widgets, Live Activity.
- **Settings extras:** extensions, connected apps, checkout / payments, reports, chairs & rooms, intake forms, plan & billing.
- **Platforms and input:** tablet, voice.

## Schema-gap decisions (no schema change in v1)
| Design shows | Database today | v1 decision |
| ------------ | -------------- | ----------- |
| "Needs confirming" capsule | `appointment_status` has no `pending` | **Drop in v1.** Every booking is confirmed atomically. Revisit if owners want approval for WhatsApp bookings. |
| Check-in / check-out | `appointments.checked_in_at`, status `completed` | Check-in uses `check_in_appointment`. Check-out = set status `completed`. |
| Chairs & rooms, Chairs lens | No resources table | **Drop in v1.** |
| Intake forms | No table | **Drop in v1** (it is an extension). |
| "Regular" badge / filter | No column | **Derive it:** 3 or more completed visits in the last 180 days. Pure function, no schema change. |
| "N open slots" on Today | Not computed | **Omit in v1.** Today's summary shows only the expected total. |
| Deposits | Not modelled | **Drop in v1** (needs a payment app). |
| Reports | `dashboard_summary` RPC exists | Not a v1 screen. Keep the RPC. |

## Design-to-code rules for v1
- Depth tokens come from `packages/ui/src/tokens/depth.ts` (`@booking/ui`); never hand-roll shadows.
- Android is the first test device. Check each screen on an Android build, not just the iOS artboards.
- **Accessibility:**
  - Every pressable has an accessible label.
  - Text scales with system font size (no fixed heights on text containers).
  - Respect reduced motion.
  - Touch targets are 44pt or larger.
- Placeholders: the app name is "Booking" (`app.json` name) and the tint is iOS blue until a brand is chosen.
