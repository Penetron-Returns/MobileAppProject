# availability

Pure functions that turn the schedule into bookable windows, then free days and slots. No I/O: callers pass the data and an injected `now`. Availability is always computed live, never cached.

Rule order (docs/booking-core.md): business hours (one range per weekday) → special days → staff hours (clipped to both) → staff breaks → staff time off → appointments, buffer, lead time, horizon.

- `lib/windows.ts`: window algebra and `staffWindowsFor` (the first five rules)
- `lib/availability.ts`: slots, days, `findSlot`; re-exports the window types
- `lib/conflicts.ts`, `lib/holidays.ts`, `lib/mappers.ts`, `lib/hours.ts`: conflict preview, South African public holidays, DTO mapping, one-range check
- `services/`: special days, staff breaks and time off, config and conflicts reads (over `BookingRepository`)

Tests: `apps/api/test/booking/availability.test.ts` and `availabilityModel.test.ts` (table-driven, including DST and midnight edges), `scheduleLib.test.ts`, `scheduleRoutes.test.ts`.
