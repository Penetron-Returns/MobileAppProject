# Engineering principles (SOLID, applied to this codebase)

Write code a teammate can change safely in six months. Prefer boring, explicit code over clever code.

## SOLID, concretely
- **Single responsibility.** One reason to change per module.
  - Backend: route handlers only parse, authorise and shape HTTP. Services own business rules. Repositories own persistence.
  - App: screens compose, hooks fetch and mutate, components present.
  - If a file answers two of those questions, split it.
- **Open/closed.** Extend by adding, not by editing switches spread across files.
  - New cron job: register it in `CRON_JOBS`.
  - New message type: add a builder.
  - New visual variant: add a `cva` variant.
  - New conversation state: add a handler to the transition table.
- **Liskov substitution.** Every implementation of a port behaves identically: the same errors (`AppError` codes), ordering, idempotency and nullability. In-memory fakes must honour the real contract so tests don't lie. When a fake and the real implementation disagree, fix the fake.
- **Interface segregation.** Keep ports and props small.
  - `BookingService` and `NotificationService` are separate for a reason.
  - Components take the fields they render, not whole DTOs, unless they render most of it.
  - Don't add optional flags to widen a component's job; make a new component.
- **Dependency inversion.** Domain code depends on ports (`backend/src/ports.ts`, repository interfaces), never on `supabase-js`, `fetch` or Clerk directly.
  - Wire concrete implementations only in the composition root (`backend/src/container.ts`) or app providers.
  - Screens call feature hooks, never `supabase` or `api` directly.

## Also
- **YAGNI beats speculative abstraction.** Introduce an interface only when there are two implementations (fake + real counts) or a real boundary. Three similar lines is fine. A premature framework is not.
- **Composition over inheritance.** No class hierarchies in React. Prefer small functions and hooks.
- **Pure core, thin shell.** Availability, conversation transitions, calendar layout and formatting are pure functions with injected `now`/timezone. I/O lives at the edges.
- **Determinism.** Same input gives the same output. No `Math.random`/`Date.now()` inside domain logic; inject clocks and ID generators.
- **Size limits (guidelines, not laws):** files ≲ 300 lines, functions ≲ 40 lines, ≤ 4 parameters (use an options object beyond that), nesting ≤ 3. Exceeding them is a signal to split.
- **Types:** `strict` TypeScript, no `any` (use `unknown` + narrowing), no non-null `!` without a comment on why it's safe. Validate all external input with zod at the boundary; trust types inside.
- **Naming:** say what it is (`listAvailableSlots`, not `getData`). Booleans read as questions (`isActive`, `acceptsBookings`). No abbreviations beyond well-known ones (`id`, `url`, `dto`).
- **Comments explain why, not what.** Delete commented-out code. `TODO` needs an owner or an issue link.
- **Errors:** throw typed `AppError`s (backend) or `ApiError`s (app). Never swallow errors silently. Log them and surface them to the user with the `request_id`.
- **No dead code or unused exports.** Remove what you replace in the same change.
