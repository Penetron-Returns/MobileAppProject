---
paths: apps/api/src/container.ts,packages/features/**/ports.ts,packages/features/**/services/**/*.ts,packages/features/bookings/**/*.ts,packages/app-store/**/notifications/**/*.ts
description: Rules for domain services, ports between modules and the composition root
---

# Services And Ports

Services own the business rules. Modules talk to each other only through the ports in [packages/features/ports.ts](/packages/features/ports.ts) (a barrel over each feature's `ports.ts`), and implementations are wired only in [container.ts](/apps/api/src/container.ts). Put a port in the `ports.ts` of the feature that owns the contract.

## Implementation

1. Put business rules (availability, cancellation windows, staff tie-breaks, notification policy) in services, never in routes or repositories.
2. Keep pure logic separate from I/O. The availability engine is a pure function over rules, overrides, busy ranges and an injected `now`.
3. Cross modules only through ports. Changing a port signature means updating every implementation, fake and caller in the same PR.
4. Make fakes (the fakes in `packages/testing`, e.g. the in-memory booking repository) honour the real contract: same errors, ordering and idempotency.
5. Never let notification delivery failures fail a booking. Catch, log and escalate.
6. Pass the `Actor` (`customer` / `staff` / `system`) through every mutation for audit attribution.

## Examples

```typescript
// ✅ DO: validate against live availability, then write atomically
const slots = await this.listAvailableSlots({ businessId, serviceId, staffId, date, now });
if (!slots.some((s) => s.starts_at === startsAt)) throw new AppError('SLOT_UNAVAILABLE', '…');
return repo.createAppointment({ … });

// ❌ DON'T: trust the client and skip re-validation
return repo.createAppointment(body);
```
