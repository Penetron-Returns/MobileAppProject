# @booking/features

The booking domain as runtime-neutral TypeScript: business rules, services, repositories and pure logic. It
runs unchanged on Deno (the API) and Node (tests). It never imports Hono, an app,
or `@booking/app-store`; `dependency-cruiser` fails the build if it does. React Native UI
does **not** live here (Metro would bundle server code): UI stays in `apps/mobile`.

## Layout

One folder per feature. Each holds what it needs from `services/`, `lib/` and `ports.ts`, and has a short README.

| Folder          | Owns                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bookings/`     | `BookingService` (create, reschedule, cancel, list), web booking attempts, the cleanup job, DTO mappers                    |
| `availability/` | Pure slot and day computation (live, never cached)                                                                         |
| `catalog/`      | Business details and hours, services, staff, overrides, the `/me` payload                                                  |
| `clients/`      | Client upsert, edit and notes                                                                                              |
| `team/`         | Team and invitations, Clerk membership sync and webhooks, the `ClerkAdmin` client, device registration                     |
| `onboarding/`   | First-run business creation                                                                                                |
| `reports/`      | Monthly booking figures behind `GET /v1/reports/summary`                                                                   |
| `repositories/` | Persistence for the booking schema: the interfaces (`types.ts`), the Supabase implementation (`supabase.ts`), row types    |
| `lib/`          | Cross-feature helpers: `AppError`, logger, time, phone, crypto, the `Db` type                                              |
| `ports.ts`      | Barrel for every feature's `ports.ts`                                                                                      |

## Rules

- Depend on ports and repository interfaces. The service-role client is created in `apps/api/src/lib/db.ts` and
  passed in; this package only knows its `Db` type.
- Scope every query by `business_id`. RLS is the last line of defence.
- Take `now`, timezones and ID generators as parameters so logic stays pure and tests need no clock.
- Keep files under about 300 lines and functions under about 40.
- In-memory fakes live in `@booking/testing` and must honour the same contract as the real implementation.
