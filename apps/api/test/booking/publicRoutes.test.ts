import { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRateLimiter } from '@booking/features/bookings/lib/rateLimit.ts';
import { baseContext, errorHandler } from '../../src/middleware/common.ts';
import { idempotency } from '../../src/middleware/idempotency.ts';
import { createPublicRoutes, publicRateLimiter } from '../../src/routes/public.ts';
import type { AppEnv } from '../../src/types.ts';
import { memoryIdempotencyStore, testContainer } from '../helpers.ts';
import { sast, WED } from './fixtures.ts';
import { harness, type Harness } from './harness.ts';

let h: Harness;
beforeEach(() => {
  publicRateLimiter.reset();
  h = harness();
});

const pub = (method: string, path: string, body?: unknown, key?: string) =>
  h.call(method, `/public${path}`, { token: null, body, ...(key ? { key } : {}) });

const bookingBody = (over: Record<string, unknown> = {}) => ({
  service_id: h.cut.id,
  starts_at: sast('09:00'),
  name: 'Web Customer',
  phone: '074 123 4567',
  ...over,
});

describe('GET /public/b/:slug', () => {
  it('exposes active services and bookable staff without PII', async () => {
    const res = await pub('GET', '/b/salon');
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.business).toEqual({
      id: h.business.id,
      name: 'Salon',
      slug: 'salon',
      timezone: 'Africa/Johannesburg',
      currency: 'ZAR',
      logo_url: null,
      address: '1 Main Rd',
      allow_staff_selection: true,
    });
    expect(data.services.map((s: { name: string }) => s.name)).toEqual(['Colour', 'Cut']);
    expect(data.staff).toEqual([
      { id: h.thandi.id, name: 'Thandi', title: null, photo_url: null },
      { id: h.sipho.id, name: 'Sipho', title: null, photo_url: null },
    ]);
    expect(data.staff_services).toEqual({ [h.colour.id]: [h.thandi.id], [h.cut.id]: [h.thandi.id, h.sipho.id] });
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('+2782');
    expect(json).not.toContain('owner@example.com');
    expect(json).not.toContain('clerk_org_id');
  });

  it('hides staff when staff selection is disabled', async () => {
    h.business.booking_rules = { ...h.business.booking_rules, allow_staff_selection: false };
    const res = await pub('GET', '/b/salon');
    expect(res.body.data.staff).toEqual([]);
    expect(res.body.data.staff_services).toEqual({});
  });

  it('404s for unknown slugs', async () => {
    expect((await pub('GET', '/b/nope')).status).toBe(404);
  });
});

describe('public availability', () => {
  it('serves the same slots as v1', async () => {
    const res = await pub('GET', `/b/salon/availability/slots?service_id=${h.cut.id}&date=${WED}`);
    expect(res.status).toBe(200);
    expect(res.body.data.slots[0]).toEqual({ starts_at: sast('09:00'), ends_at: sast('10:00'), staff_ids: [h.thandi.id, h.sipho.id] });
    const days = await pub('GET', `/b/salon/availability/days?service_id=${h.cut.id}&from=2026-09-28&to=2026-09-30`);
    expect(days.body.data.days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
  });

  it('treats inactive services as missing', async () => {
    expect((await pub('GET', `/b/salon/availability/slots?service_id=${h.inactive.id}&date=${WED}`)).status).toBe(404);
  });
});

describe('web booking flow with attempt instrumentation', () => {
  it('records start → steps → completion', async () => {
    const start = await pub('POST', '/b/salon/attempts', undefined, 'web-start-0001');
    expect(start.status).toBe(201);
    const attemptId = start.body.data.attempt_id;

    for (const step of ['service_selected', 'slot_selected']) {
      const res = await pub('POST', `/attempts/${attemptId}/steps`, { step });
      expect(res.status).toBe(200);
    }
    const booked = await pub('POST', '/b/salon/bookings', bookingBody({ attempt_id: attemptId }), 'web-book-0001');
    expect(booked.status).toBe(201);
    expect(booked.body.data.appointment).toEqual({
      id: expect.any(String),
      starts_at: sast('09:00'),
      ends_at: sast('10:00'),
      status: 'confirmed',
      service_id: h.cut.id,
      staff_id: h.thandi.id,
    });

    const attempt = h.repo.tables.booking_attempts.find((a) => a.id === attemptId)!;
    expect(attempt).toMatchObject({
      channel: 'web',
      business_id: h.business.id,
      session_key: 'web:web-start-0001',
      outcome: 'completed',
      appointment_id: booked.body.data.appointment.id,
      step_count: 2,
      error_code: null,
    });
    expect(attempt.steps.map((s) => s.step)).toEqual(['service_selected', 'slot_selected']);
    expect(attempt.completed_at).toBeTruthy();

    const appt = h.repo.tables.appointments[0]!;
    expect(appt).toMatchObject({ source: 'web', idempotency_key: 'web:web-book-0001', client_id: attempt.client_id });
    expect(h.repo.tables.clients.find((c) => c.id === appt.client_id)).toMatchObject({ phone_e164: '+27741234567', name: 'Web Customer' });
    expect(h.events).toEqual([expect.objectContaining({ kind: 'created', notifyCustomer: true, actor: { type: 'customer', id: appt.client_id } })]);

    const late = await pub('POST', `/attempts/${attemptId}/steps`, { step: 'extra' });
    expect(late.status).toBe(422);
    expect(late.body.error.details).toEqual({ rule: 'ATTEMPT_CLOSED' });
  });

  it('marks the attempt failed with the error code, then lets it complete on retry', async () => {
    await pub('POST', '/b/salon/bookings', bookingBody({ staff_id: h.thandi.id, phone: '0740000001' }));
    const attemptId = (await pub('POST', '/b/salon/attempts')).body.data.attempt_id;

    const clash = await pub('POST', '/b/salon/bookings', bookingBody({ attempt_id: attemptId, staff_id: h.thandi.id }));
    expect(clash.status).toBe(409);
    expect(h.repo.tables.booking_attempts.find((a) => a.id === attemptId)).toMatchObject({ outcome: 'failed', error_code: 'SLOT_UNAVAILABLE' });

    const retry = await pub('POST', '/b/salon/bookings', bookingBody({ attempt_id: attemptId, starts_at: sast('10:00') }));
    expect(retry.status).toBe(201);
    expect(h.repo.tables.booking_attempts.find((a) => a.id === attemptId)).toMatchObject({ outcome: 'completed', error_code: null });
  });

  it('records rule codes for rule violations', async () => {
    h.repo.tables.clients.find((c) => c.id === h.client.id)!.is_blocked = true;
    const attemptId = (await pub('POST', '/b/salon/attempts')).body.data.attempt_id;
    const res = await pub('POST', '/b/salon/bookings', bookingBody({ attempt_id: attemptId, phone: h.client.phone_e164 }));
    expect(res.status).toBe(422);
    expect(h.repo.tables.booking_attempts[0]).toMatchObject({ outcome: 'failed', error_code: 'CLIENT_BLOCKED' });
  });

  it('never overwrites an existing client from the public form', async () => {
    const res = await pub('POST', '/b/salon/bookings', bookingBody({ phone: '082 123 4567', name: 'Impostor', email: 'x@example.com' }));
    expect(res.status).toBe(201);
    expect(h.repo.tables.clients.find((c) => c.id === h.client.id)).toMatchObject({ name: 'Nadia', email: 'x@example.com' });
  });

  it('ignores staff_id when staff selection is disabled', async () => {
    h.business.booking_rules = { ...h.business.booking_rules, allow_staff_selection: false };
    await pub('POST', '/b/salon/bookings', bookingBody({ phone: '0740000001', starts_at: sast('10:00') }));
    const res = await pub('POST', '/b/salon/bookings', bookingBody({ staff_id: h.thandi.id }));
    expect(res.status).toBe(201);
    expect(res.body.data.appointment.staff_id).toBe(h.sipho.id);
  });

  it('validates input and attempt ownership', async () => {
    expect((await pub('POST', '/b/salon/bookings', bookingBody({ phone: '12' }))).status).toBe(400);
    expect((await pub('POST', '/b/salon/bookings', bookingBody({ name: '' }))).status).toBe(400);
    const attemptId = (await pub('POST', '/b/salon/attempts')).body.data.attempt_id;
    expect((await pub('POST', `/attempts/${attemptId}/steps`, { step: 'Hello there, my number is 0821234567' })).status).toBe(400);
    expect((await pub('POST', '/attempts/00000000-0000-4000-8000-999999999999/steps', { step: 'x' })).status).toBe(404);
    expect((await pub('POST', '/b/salon/bookings', bookingBody({ attempt_id: '00000000-0000-4000-8000-999999999999' }))).status).toBe(404);
    expect((await pub('POST', '/b/salon/bookings', bookingBody(), undefined)).status).toBe(201);
    const noKey = await h.call('POST', '/public/b/salon/attempts', { token: null, key: null });
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('public rate limit', () => {
  it('limits POSTs per client IP', async () => {
    const container = { ...testContainer(), bookingRepository: h.repo };
    const store = memoryIdempotencyStore();
    const app = new Hono<AppEnv>();
    app.onError(errorHandler);
    app.use('*', baseContext(() => container));
    app.use('*', idempotency(() => store));
    app.route('/public', createPublicRoutes(createRateLimiter({ limit: 2, windowMs: 60_000 })));
    const post = (ip: string, n: number) =>
      app.request('/public/b/salon/attempts', {
        method: 'POST',
        headers: { 'x-forwarded-for': `${ip}, 10.0.0.1`, 'idempotency-key': `rate-limit-${ip}-${n}` },
      });
    expect((await post('1.1.1.1', 1)).status).toBe(201);
    expect((await post('1.1.1.1', 2)).status).toBe(201);
    const limited = await post('1.1.1.1', 3);
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
    expect((await post('2.2.2.2', 1)).status).toBe(201);
    expect((await app.request('/public/b/salon')).status).toBe(200);
  });

  it('opens a new window after windowMs', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.hit('a', 0)).toBe(true);
    expect(limiter.hit('a', 500)).toBe(false);
    expect(limiter.hit('a', 1000)).toBe(true);
  });
});
