import { beforeEach, describe, expect, it } from 'vitest';

import type { BillingConfig } from '@booking/features/billing/ports.ts';
import { createBillingService } from '@booking/features/billing/services/billingService.ts';
import { createBookingServiceFromRepository } from '@booking/features/bookings/services/bookingService.ts';
import type { Actor, BookingMeter, BookingService } from '@booking/features/ports.ts';
import { createFakeStripe, createMemoryBillingRepository, type MemoryBooking } from '@booking/testing/billing.ts';
import { createApp } from '../../src/app.ts';
import { CRON_JOBS } from '../../src/routes/cron.ts';
import { silentLogger } from '../booking/harness.ts';
import { NOW, sast, seed, type Seed } from '../booking/fixtures.ts';
import { memoryIdempotencyStore, testContainer } from '../helpers.ts';

const staff: Actor = { type: 'staff', id: 'user_staff' };
const CONFIG: BillingConfig = {
  prices: { growth: { ZAR: 'price_growth' } },
  usagePrices: { growth: { ZAR: 'price_growth_usage' } },
  meterEventName: 'booking_made',
  successUrl: 'clovie://billing/success',
  cancelUrl: 'clovie://billing/cancel',
  returnUrl: 'clovie://billing/return',
};
const DAY = 24 * 60 * 60 * 1000;

interface Options {
  /** Business starts metered (active subscription, metering started a day before NOW) */
  subscribed?: boolean;
  status?: 'active' | 'canceled' | 'past_due';
  deferred?: boolean;
  config?: BillingConfig | null;
}

describe('usage metering: every booking made is one meter event', () => {
  let s: Seed;
  let stripe: ReturnType<typeof createFakeStripe>;
  let repo: ReturnType<typeof createMemoryBillingRepository>;
  let bookings: MemoryBooking[];
  let booking: BookingService;
  let billing: ReturnType<typeof createBillingService>;
  let deferred: (() => Promise<unknown>)[];

  async function setup(opts: Options = {}) {
    s = seed();
    stripe = createFakeStripe();
    bookings = [];
    deferred = [];
    repo = createMemoryBillingRepository({ [s.business.id]: { plan: 'growth' } }, bookings);
    if (opts.subscribed !== false) {
      await repo.saveCustomer(s.business.id, 'cus_1');
      await repo.updateSubscription(s.business.id, {
        stripeSubscriptionId: 'sub_1',
        status: opts.status ?? 'active',
        plan: 'growth',
        reportingStartedAt: new Date(NOW.getTime() - DAY).toISOString(),
      });
    }
    billing = createBillingService({
      stripe,
      config: 'config' in opts ? (opts.config ?? null) : CONFIG,
      repo,
      events: { accountChanged: async () => {} },
      logger: silentLogger,
    });
    // The real database row exists before the meter hears about it: mirror that so the fake can stamp it.
    const meter: BookingMeter = {
      bookingCreated: async (b) => {
        bookings.push({ id: b.appointmentId, businessId: b.businessId, createdAt: b.createdAt });
        await billing.bookingCreated(b);
      },
    };
    booking = createBookingServiceFromRepository({
      repository: s.repo,
      notifications: { appointmentChanged: async () => {} },
      logger: silentLogger,
      clock: () => NOW,
      meter,
      defer: opts.deferred ? (task) => void deferred.push(task) : undefined,
    });
  }

  const create = (over: Record<string, unknown> = {}) =>
    booking.createAppointment({
      businessId: s.business.id,
      clientId: s.client.id,
      serviceId: s.cut.id,
      startsAt: sast('09:00'),
      source: 'app',
      idempotencyKey: `k-${Math.random()}`,
      actor: staff,
      ...over,
    });

  beforeEach(() => setup());

  it('sends one event per booking: identifier = the appointment, timestamp = when it was created, value 1', async () => {
    const a = await create({ staffId: s.thandi.id });
    const b = await create({ startsAt: sast('11:00'), staffId: s.thandi.id });
    expect(stripe.meterEvents.size).toBe(2);
    const row = s.repo.tables.appointments.find((r) => r.id === a.id)!;
    expect(stripe.meterEvents.get(`booking:${a.id}`)).toEqual({ eventName: 'booking_made', customerId: 'cus_1', timestamp: new Date(row.created_at).toISOString(), value: 1 });
    expect(stripe.meterEvents.has(`booking:${b.id}`)).toBe(true);
    expect(bookings.every((x) => x.reportedAt)).toBe(true);
  });

  it('counts a booking whatever its source', async () => {
    for (const [i, source] of (['whatsapp', 'app', 'web', 'nerova'] as const).entries()) {
      await create({ source, startsAt: sast(['09:00', '10:00', '13:00', '14:00'][i]!), staffId: s.thandi.id });
    }
    expect(stripe.meterEvents.size).toBe(4);
  });

  it('does not add an event when the booking is rescheduled (the same appointment moves)', async () => {
    const a = await create({ staffId: s.sipho.id });
    await booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: a.id, startsAt: sast('09:30'), actor: staff });
    await booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: a.id, startsAt: sast('10:00'), actor: staff });
    expect(stripe.meterCalls).toBe(1);
    expect(stripe.meterEvents.size).toBe(1);
  });

  it('still counts a booking that is cancelled or becomes a no-show: nothing is withdrawn or added', async () => {
    const a = await create({ staffId: s.thandi.id });
    const b = await create({ startsAt: sast('11:00'), staffId: s.thandi.id });
    await booking.cancelAppointment({ businessId: s.business.id, appointmentId: a.id, actor: staff });
    await booking.setAppointmentStatus(s.business.id, b.id, 'no_show', staff);
    expect(stripe.meterEvents.size).toBe(2);
    expect(stripe.meterCalls).toBe(2);
  });

  it('does not meter a replayed create (same idempotency key) a second time', async () => {
    await create({ idempotencyKey: 'same-key-1', staffId: s.thandi.id });
    await create({ idempotencyKey: 'same-key-1', staffId: s.thandi.id });
    expect(stripe.meterCalls).toBe(1);
  });

  it('never lets a Stripe failure affect the booking; the sweep sends it later, once', async () => {
    stripe.failMeterEvents = 1;
    const a = await create({ staffId: s.thandi.id });
    expect(a.id).toBeTruthy();
    expect(s.repo.tables.appointments.some((r) => r.id === a.id)).toBe(true);
    expect(stripe.meterEvents.size).toBe(0);
    expect(bookings[0]?.reportedAt).toBeUndefined();

    expect(await billing.sweepUnreportedBookings(NOW)).toEqual({ reported: 1, failed: 0, notConfigured: 0 });
    expect(stripe.meterEvents.has(`booking:${a.id}`)).toBe(true);
    expect(bookings[0]?.reportedAt).toBe(NOW.toISOString());

    // idempotent: a second run has nothing left, and no new Stripe call is made
    const calls = stripe.meterCalls;
    expect(await billing.sweepUnreportedBookings(NOW)).toEqual({ reported: 0, failed: 0, notConfigured: 0 });
    expect(stripe.meterCalls).toBe(calls);
  });

  it('keeps unreported bookings for the next run when Stripe is still down, counting the failures', async () => {
    stripe.failMeterEvents = 2;
    await create({ staffId: s.thandi.id });
    await create({ startsAt: sast('11:00'), staffId: s.thandi.id });
    stripe.failMeterEvents = 2;
    expect(await billing.sweepUnreportedBookings(NOW)).toEqual({ reported: 0, failed: 2, notConfigured: 0 });
    expect(bookings.every((b) => !b.reportedAt)).toBe(true);
    expect(await billing.sweepUnreportedBookings(NOW)).toMatchObject({ reported: 2, failed: 0 });
    expect(stripe.meterEvents.size).toBe(2);
  });

  it('re-sending a booking Stripe already has changes nothing (dedupe on the identifier)', async () => {
    const a = await create({ staffId: s.thandi.id });
    bookings[0]!.reportedAt = null; // as if the stamp was lost after the send
    await billing.sweepUnreportedBookings(NOW);
    expect(stripe.meterCalls).toBe(2);
    expect(stripe.meterEvents.size).toBe(1);
    expect(stripe.meterEvents.has(`booking:${a.id}`)).toBe(true);
  });

  it('sends after the booking committed when deferred, never inside the booking call', async () => {
    await setup({ deferred: true });
    await create({ staffId: s.thandi.id });
    expect(stripe.meterCalls).toBe(0);
    await Promise.all(deferred.map((task) => task()));
    expect(stripe.meterCalls).toBe(1);
  });

  it('skips a business without a subscription, inline and in the sweep', async () => {
    await setup({ subscribed: false });
    await create({ staffId: s.thandi.id });
    expect(stripe.meterCalls).toBe(0);
    expect(await billing.sweepUnreportedBookings(NOW)).toEqual({ reported: 0, failed: 0, notConfigured: 0 });
    expect(stripe.meterCalls).toBe(0);
  });

  it('skips a cancelled subscription but still meters past_due (access is kept)', async () => {
    await setup({ status: 'canceled' });
    await create({ staffId: s.thandi.id });
    expect(stripe.meterCalls).toBe(0);
    await setup({ status: 'past_due' });
    await create({ staffId: s.thandi.id });
    expect(stripe.meterCalls).toBe(1);
  });

  it('never meters bookings made before metering started (no history bill on activation)', async () => {
    const before = { id: 'old-booking', businessId: s.business.id, createdAt: new Date(NOW.getTime() - 3 * DAY).toISOString() };
    bookings.push(before);
    await billing.bookingCreated({ appointmentId: before.id, businessId: before.businessId, createdAt: before.createdAt });
    expect(await billing.sweepUnreportedBookings(NOW)).toMatchObject({ reported: 0 });
    expect(stripe.meterCalls).toBe(0);
  });

  it('the sweep only reaches 34 days back, inside Stripe\'s 35 day window', async () => {
    await repo.updateSubscription(s.business.id, { reportingStartedAt: new Date(NOW.getTime() - 60 * DAY).toISOString() });
    bookings.push(
      { id: 'b-33', businessId: s.business.id, createdAt: new Date(NOW.getTime() - 33 * DAY).toISOString() },
      { id: 'b-35', businessId: s.business.id, createdAt: new Date(NOW.getTime() - 35 * DAY).toISOString() },
    );
    expect(await billing.sweepUnreportedBookings(NOW)).toMatchObject({ reported: 1 });
    expect([...stripe.meterEvents.keys()]).toEqual(['booking:b-33']);
    // the event carries the booking's own time, not the time of the sweep
    expect(stripe.meterEvents.get('booking:b-33')?.timestamp).toBe(new Date(NOW.getTime() - 33 * DAY).toISOString());
  });

  it('a month-end booking is stamped at its creation instant so it lands in the right Stripe period', async () => {
    const lastSecond = '2026-09-30T21:59:59.000Z'; // still September in Johannesburg is 23:59:59 SAST
    bookings.push({ id: 'b-edge', businessId: s.business.id, createdAt: lastSecond });
    await repo.updateSubscription(s.business.id, { reportingStartedAt: '2026-09-01T00:00:00.000Z' });
    await billing.sweepUnreportedBookings(new Date('2026-10-02T04:00:00.000Z'));
    expect(stripe.meterEvents.get('booking:b-edge')?.timestamp).toBe(lastSecond);
  });

  it('reports not_configured without touching anything when Stripe is off', async () => {
    await setup({ config: null });
    expect(await billing.sweepUnreportedBookings(NOW)).toEqual({ reported: 0, failed: 0, notConfigured: 1 });
  });
});

describe('billing-usage cron job', () => {
  it('is registered in CRON_JOBS and runs the sweep, answering the counts', async () => {
    expect(CRON_JOBS['billing-usage']).toBeTypeOf('function');
    const stripe = createFakeStripe();
    const repo = createMemoryBillingRepository({ biz: { plan: 'growth' } }, [{ id: 'a1', businessId: 'biz', createdAt: NOW.toISOString() }]);
    await repo.saveCustomer('biz', 'cus_1');
    await repo.updateSubscription('biz', { stripeSubscriptionId: 'sub_1', status: 'active', plan: 'growth', reportingStartedAt: new Date(NOW.getTime() - DAY).toISOString() });
    const billing = createBillingService({ stripe, config: CONFIG, repo, events: { accountChanged: async () => {} }, logger: silentLogger });
    const container = testContainer({ billing, clock: () => NOW });
    const app = createApp({ getContainer: () => container, idempotencyStore: () => memoryIdempotencyStore() });

    const denied = await app.request('/cron/billing-usage', { method: 'POST' });
    expect(denied.status).toBe(401);
    const res = await app.request('/cron/billing-usage', { method: 'POST', headers: { 'x-cron-secret': 'cron-secret' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data).toEqual({ job: 'billing-usage', result: { reported: 1, failed: 0, not_configured: 0 } });
    expect(stripe.meterEvents.has('booking:a1')).toBe(true);
  });
});
