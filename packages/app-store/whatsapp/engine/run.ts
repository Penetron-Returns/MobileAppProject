/**
 * Drives the pure transition: whenever it answers `{ need }`, fetch that
 * piece of data through the BookingService and call it again. This keeps
 * the transition table-testable with a plain data object, while the data it
 * reads is always live (availability is never cached across messages).
 */
import type { BookingService } from '@booking/features/ports.ts';
import { addDays, todayIn } from '../format.ts';
import { transition } from './transition.ts';
import { dataKey, type DataRequest, type EngineCtx, type EngineInput, type Snapshot, type Transition } from './types.ts';

export type DataLoader = (req: DataRequest) => Promise<unknown>;

const MAX_LOADS = 40;

export async function runTransition(snap: Snapshot, input: EngineInput, ctx: EngineCtx, load: DataLoader): Promise<Transition> {
  for (let i = 0; i <= MAX_LOADS; i++) {
    const result = transition(snap, input, ctx);
    if (!('need' in result)) return result;
    ctx.data[dataKey(result.need)] = await load(result.need);
  }
  throw new Error('engine exceeded data load budget');
}

export function bookingLoader(booking: BookingService, ctx: Pick<EngineCtx, 'business' | 'clientId' | 'now'>): DataLoader {
  const businessId = ctx.business.id;
  return async (req) => {
    switch (req.kind) {
      case 'services':
        return booking.listServices(businessId, { activeOnly: true });
      case 'staff':
        return booking.listBookableStaff(businessId, req.serviceId);
      case 'days': {
        const from = todayIn(ctx.business.timezone, ctx.now);
        const to = addDays(from, ctx.business.rules.booking_horizon_days, ctx.business.timezone);
        return booking.listAvailableDays({ businessId, serviceId: req.serviceId, staffId: req.staffId, from, to, now: ctx.now });
      }
      case 'slots': {
        const res = await booking.listAvailableSlots({
          businessId,
          serviceId: req.serviceId,
          staffId: req.staffId,
          date: req.date,
          now: ctx.now,
        });
        return res.slots;
      }
      case 'upcoming':
        return booking.listUpcomingForClient(businessId, ctx.clientId, ctx.now);
      case 'appointment':
        return booking.getAppointment(businessId, req.id);
    }
  };
}
