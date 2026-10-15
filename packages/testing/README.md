# @booking/testing

Shared fakes for tests. Production code never imports this package (`dependency-cruiser` enforces it).

- `bookingMemoryRepository.ts`: in-memory `BookingRepository`
- `clerkAdmin.ts`: fake `ClerkAdmin`
- `entitlements.ts`: fake `EntitlementService` mirroring the `plan_features` seed
- `whatsapp/`: fake WhatsApp repository, Graph client, booking world, deps builder and webhook payload builders

A fake and the real implementation must honour the same contract (error codes, ordering, idempotency). When they
disagree, fix the fake. Tests live in `apps/api/test` and import these through `@booking/testing/...`.
