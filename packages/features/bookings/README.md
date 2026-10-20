# bookings

`BookingService` (`services/bookingService.ts`) is the only way to write an appointment. It validates against live availability, then writes atomically through the `create_appointment` RPC; the exclusion constraint makes double booking impossible. Every mutation takes an idempotency key and an actor.

- `ports.ts`: `BookingService`, `NotificationService`, query and input types
- A committed change notifies through `NotificationService` only (customer WhatsApp message, staff push); there is no outbound event feed
- `services/`: the booking service, web booking attempts (research timings), appointment status and notes, the daily cleanup job
- `lib/`: DTO mappers and the in-process rate limiter for the public web booking
- `index.ts`: `createBookingService` over the Supabase repository, and `getBookingRepository`
