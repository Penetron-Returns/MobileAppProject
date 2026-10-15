# availability

Pure functions that turn business hours, staff availability, overrides, buffers, lead time and busy ranges into free days and slots. No I/O: callers pass the data and an injected `now`. Availability is always computed live, never cached.

Tests: `apps/api/test/booking/availability.test.ts` (table-driven, including DST and midnight edges).
