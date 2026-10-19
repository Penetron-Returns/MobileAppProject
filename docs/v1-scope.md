# Free edition scope

This branch is the free edition of the booking app: the owner app plus deterministic, menu-based WhatsApp booking
and a web booking comparator, for the ITMDA3 research project. The full contract is [BUILD_PLAN.md](BUILD_PLAN.md).
This file only records what is in and out, and a few product decisions the code relies on.

## In scope

- Sign-in (Clerk prebuilt UI) and onboarding: welcome, business type, business name. The app opens right after.
- Tabs: Calendar (day, week, month), Reports, Clients, Settings, plus an Inbox bubble. New booking is reached from
  the Calendar.
- Booking detail: check in, message, reschedule, cancel, status. Attendance checks ("did the client come?").
- Clients: search, All / Recent / Regulars, client profile with notes and history.
- Settings: business details, operating hours, services, team and staff, booking rules, WhatsApp (status,
  pause/resume, reminder offsets), notifications, delete account.
- Inbox: conversations and escalations from the WhatsApp menu flow, staff reply, release to the bot.
- WhatsApp: deterministic menus, lists and Flows. Reminders, confirmations, rescheduling and cancelling.
- Web booking page `/book/[slug]` as the research comparator, with step counts and timings in `booking_attempts`.

## Out of scope (removed from this edition)

- Any AI: no companion chat, no free-text understanding, no voice or wake word, no stories.
- Payments, plans and billing: there is one (free) plan and nothing is gated.
- Calendar extras (drag, resize, sweep-to-create), widgets, tablet layouts, extensions (intake forms, deposits).

## Schema-gap decisions

| Design shows | Database today | Decision |
| ------------ | -------------- | -------- |
| "Needs confirming" capsule | `appointment_status` has no `pending` | Dropped. Every booking is confirmed atomically |
| Check-in / check-out | `appointments.checked_in_at`, status `completed` | Check-in uses `check_in_appointment`; check-out sets status `completed` |
| "Regular" badge / filter | No column | Derived: 3 or more completed visits in the last 180 days. Pure function, no schema change |
| Chairs and rooms | No resources table | Dropped |

## Design-to-code rules

- Depth tokens come from `packages/ui/src/tokens/depth.ts` (`@booking/ui`); never hand-roll shadows.
- Every pressable has an accessible label, text scales with the system font size, reduced motion is respected and
  touch targets are 44pt or larger.
