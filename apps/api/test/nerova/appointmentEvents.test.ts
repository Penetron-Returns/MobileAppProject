import { beforeEach, describe, expect, it } from 'vitest';

import {
  APPOINTMENT_EVENT_ID_PREFIX,
  APPOINTMENT_EVENT_TYPES,
  appointmentEventsFromEnv,
  createAppointmentEvents,
} from '@booking/companion/events/appointmentEvents.ts';
import type { AccountEvent, AccountEventSender } from '@booking/companion/events/events.ts';
import { createBookingServiceFromRepository } from '@booking/features/bookings/services/bookingService.ts';
import type { Actor, AppointmentEventsPort, AppointmentLifecycleEvent, BookingService } from '@booking/features/ports.ts';
import { fakeEntitlements } from '@booking/testing/entitlements.ts';
import { getEnv } from '../../src/env.ts';
import { silentLogger } from '../booking/harness.ts';
import { NOW, sast, seed, type Seed } from '../booking/fixtures.ts';

const SECRET = `whsec_${Buffer.from('nerova-signing-key-0123456789abcd').toString('base64')}`;
const staff: Actor = { type: 'staff', id: 'user_staff' };
const nerova: Actor = { type: 'nerova', id: 'conn_1' };

function recordingSender(sent: AccountEvent[]): AccountEventSender {
  return {
    async send(event) {
      sent.push(event);
    },
  };
}

describe('appointment events through the booking service', () => {
  let s: Seed;
  let booking: BookingService;
  let sent: AccountEvent[];
  let deferred: (() => Promise<unknown>)[];

  const build = (entitlements = fakeEntitlements('starter')) => {
    sent = [];
    deferred = [];
    const appointmentEvents = createAppointmentEvents({ sender: recordingSender(sent), entitlements, logger: silentLogger, clock: () => NOW });
    booking = createBookingServiceFromRepository({
      repository: s.repo,
      notifications: { appointmentChanged: async () => {} },
      logger: silentLogger,
      clock: () => NOW,
      appointmentEvents,
      defer: (task) => void deferred.push(task),
    });
  };
  const flush = async () => {
    const tasks = deferred.splice(0);
    for (const task of tasks) await task();
  };
  const create = (actor: Actor = staff, key = 'k1', at = '09:00') =>
    booking.createAppointment({ businessId: s.business.id, clientId: s.client.id, serviceId: s.cut.id, startsAt: sast(at), source: 'app', idempotencyKey: key, actor });
  const eventRowId = (appointmentId: string, type: string) =>
    s.repo.tables.appointment_events.filter((e) => e.appointment_id === appointmentId && e.type === type).at(-1)!.id;

  beforeEach(() => {
    s = seed();
    build();
  });

  it('sends nothing until the response is done: the publish is deferred', async () => {
    await create();
    expect(sent).toEqual([]);
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('sends appointment.created with id, accountId, startsAt, status and source, keyed by the event row', async () => {
    const appt = await create();
    await flush();
    expect(sent).toEqual([
      {
        id: `${APPOINTMENT_EVENT_ID_PREFIX}${eventRowId(appt.id, 'created')}`,
        type: 'appointment.created',
        createdAt: NOW.toISOString(),
        data: { id: appt.id, accountId: s.business.id, startsAt: sast('09:00'), status: 'confirmed', source: 'app' },
      },
    ]);
  });

  it('sends appointment.rescheduled with the new start and its own event id', async () => {
    const appt = await create();
    await booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: appt.id, startsAt: sast('11:00'), actor: staff });
    await flush();
    const [created, rescheduled] = sent;
    expect(rescheduled!.type).toBe('appointment.rescheduled');
    expect(rescheduled!.data).toMatchObject({ id: appt.id, startsAt: sast('11:00'), status: 'confirmed' });
    expect(rescheduled!.id).toBe(`${APPOINTMENT_EVENT_ID_PREFIX}${eventRowId(appt.id, 'rescheduled')}`);
    expect(rescheduled!.id).not.toBe(created!.id);
  });

  it('sends appointment.cancelled with status cancelled', async () => {
    const appt = await create();
    await booking.cancelAppointment({ businessId: s.business.id, appointmentId: appt.id, actor: staff });
    await flush();
    expect(sent.at(-1)).toMatchObject({ type: 'appointment.cancelled', data: { id: appt.id, status: 'cancelled' } });
  });

  it.each(['completed', 'no_show'] as const)('sends appointment.%s when staff set the status', async (status) => {
    const appt = await create();
    await booking.setAppointmentStatus(s.business.id, appt.id, status, staff);
    await flush();
    expect(sent.at(-1)).toMatchObject({ type: APPOINTMENT_EVENT_TYPES[status], data: { id: appt.id, status } });
  });

  it('does not send a second event for an idempotent replay of a create', async () => {
    await create(staff, 'same');
    await create(staff, 'same');
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('does not send when the mutation fails', async () => {
    await create(staff, 'a');
    await expect(
      booking.createAppointment({ businessId: s.business.id, clientId: s.client.id, serviceId: s.inactive.id, startsAt: sast('11:00'), source: 'app', idempotencyKey: 'b', actor: staff }),
    ).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('excludes changes made by Nerova itself', async () => {
    const appt = await create(nerova, 'n1');
    await booking.rescheduleAppointment({ businessId: s.business.id, appointmentId: appt.id, startsAt: sast('11:00'), actor: nerova });
    await booking.cancelAppointment({ businessId: s.business.id, appointmentId: appt.id, actor: nerova });
    await flush();
    expect(sent).toEqual([]);
  });

  it('still sends staff and customer changes alongside Nerova ones', async () => {
    await create(nerova, 'n1', '09:00');
    await create({ type: 'customer', id: s.client.id }, 'c1', '11:00');
    await flush();
    expect(sent.map((e) => e.type)).toEqual(['appointment.created']);
  });

  it('never announces a business without the companion feature', async () => {
    build(fakeEntitlements('free'));
    await create();
    await flush();
    expect(sent).toEqual([]);
  });

  it('survives a failing sender: the booking still succeeds', async () => {
    const failing: AccountEventSender = {
      async send() {
        throw new Error('nerova down');
      },
    };
    booking = createBookingServiceFromRepository({
      repository: s.repo,
      notifications: { appointmentChanged: async () => {} },
      logger: silentLogger,
      clock: () => NOW,
      appointmentEvents: createAppointmentEvents({ sender: failing, entitlements: fakeEntitlements('starter'), logger: silentLogger }),
    });
    await expect(create()).resolves.toMatchObject({ status: 'confirmed' });
  });
});

describe('appointmentEventsFromEnv', () => {
  const env = (over: Record<string, string | undefined>) => getEnv({ SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'k', ...over });
  const entitlements = fakeEntitlements('starter');
  const configured = { NEROVA_EVENTS_URL: 'https://nerova.test/events', NEROVA_EVENTS_SIGNING_SECRET: SECRET };

  it('is off by default, even with account events fully configured', () => {
    expect(appointmentEventsFromEnv(env({ NEROVA_EVENTS_ENABLED: 'true', ...configured }), entitlements, silentLogger).enabled).toBe(false);
  });

  it('is off unless the flag is exactly "true"', () => {
    expect(appointmentEventsFromEnv(env({ NEROVA_APPOINTMENT_EVENTS_ENABLED: 'yes', ...configured }), entitlements, silentLogger).enabled).toBe(false);
  });

  it('is off when the flag is on but the URL or secret is missing', () => {
    expect(appointmentEventsFromEnv(env({ NEROVA_APPOINTMENT_EVENTS_ENABLED: 'true' }), entitlements, silentLogger).enabled).toBe(false);
  });

  it('is on with the flag, URL and secret', () => {
    expect(appointmentEventsFromEnv(env({ NEROVA_APPOINTMENT_EVENTS_ENABLED: 'true', ...configured }), entitlements, silentLogger).enabled).toBe(true);
  });

  it('with the flag off the booking service never reads the event table nor sends', async () => {
    const s = seed();
    let lookups = 0;
    const repo = {
      ...s.repo,
      findLatestAppointmentEventId: async () => {
        lookups += 1;
        return null;
      },
    };
    const off = appointmentEventsFromEnv(env({ ...configured }), entitlements, silentLogger);
    const booking = createBookingServiceFromRepository({
      repository: repo,
      notifications: { appointmentChanged: async () => {} },
      logger: silentLogger,
      clock: () => NOW,
      appointmentEvents: off,
    });
    await booking.createAppointment({ businessId: s.business.id, clientId: s.client.id, serviceId: s.cut.id, startsAt: sast('09:00'), source: 'app', idempotencyKey: 'k', actor: staff });
    expect(lookups).toBe(0);
  });
});

describe('a disabled port', () => {
  it('is skipped by the booking service whatever implements it', async () => {
    const s = seed();
    const calls: AppointmentLifecycleEvent[] = [];
    const port: AppointmentEventsPort = {
      enabled: false,
      async appointmentChanged(e) {
        calls.push(e);
      },
    };
    const booking = createBookingServiceFromRepository({
      repository: s.repo,
      notifications: { appointmentChanged: async () => {} },
      logger: silentLogger,
      clock: () => NOW,
      appointmentEvents: port,
    });
    await booking.createAppointment({ businessId: s.business.id, clientId: s.client.id, serviceId: s.cut.id, startsAt: sast('09:00'), source: 'app', idempotencyKey: 'k', actor: staff });
    expect(calls).toEqual([]);
  });
});
