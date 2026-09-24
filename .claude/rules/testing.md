# Testing

- Every behaviour change ships with tests in the same change. Bug fixes start with a failing test.
- Pure logic (availability, transitions, calendar layout, formatting, parsing) gets table-driven unit tests covering edges: DST, midnight, empty inputs, limits.
- Inject clocks, timezones and ID generators. No real time or randomness in tests, and no sleeping.
- Use fakes through ports (in-memory repositories, fake Graph client, fake BookingService) rather than mocking module internals. Fakes must honour the real contract (see Liskov in engineering-principles).
- Route tests go through `createApp({ getContainer, verifyToken, idempotencyStore })` with `backend/test/helpers.ts`.
- Database behaviour (constraints, RLS, RPCs) is tested in `supabase/tests/*.sql` via `scripts/db/test.sh`, never only through mocks.
- Never skip, disable or loosen a test to get green. Fix the code or the test's wrong assumption.
- Test names state the behaviour: `rejects overlapping bookings for the same staff`, not `test 3`.
