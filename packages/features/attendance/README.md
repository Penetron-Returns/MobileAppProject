# attendance

The attendance check: after an appointment ends, ask the right person whether the client came and set `completed` / `no_show` from the answer. Nothing here ever sets `no_show` by itself.

- `ports.ts`: `AttendanceRepository`, `AttendancePush`, `AttendanceService`
- `lib/planner.ts`: pure `planAttendance(input) -> actions` (timing, check-in auto-complete, staff/owner mode, escalation, batching, opening hours, end-of-day summary)
- `services/attendanceJob.ts`: loads inputs, runs the planner per business, executes the actions (`/cron/attendance`)
- `services/attendanceService.ts`: `GET /v1/attendance/pending` and `POST /v1/attendance/:checkId/answer`
- `repositories/supabase.ts`: service-role persistence; fake in `packages/testing/attendanceMemory.ts`

Contract: `docs/BUILD_PLAN.md` "Attendance check".
