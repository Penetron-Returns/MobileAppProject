import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { createSupabaseRepository } from '@booking/features/repositories/supabase.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { Db } from '@booking/features/lib/db.ts';

interface Captured {
  method: string;
  path: string;
  params: URLSearchParams;
  body: unknown;
}

/** Supabase client whose fetch records requests and replies with canned JSON. */
function fakeDb(reply: (req: Captured) => { status?: number; body: unknown; headers?: Record<string, string> }) {
  const requests: Captured[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const req: Captured = {
      method: init?.method ?? 'GET',
      path: url.pathname.replace('/rest/v1', ''),
      params: url.searchParams,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(req);
    const r = reply(req);
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json', ...(r.headers ?? {}) },
    });
  };
  const db = createClient('http://localhost:54321', 'service-role', {
    auth: { persistSession: false },
    global: { fetch: fetchImpl as typeof fetch },
  }) as unknown as Db;
  return { db, requests };
}

const BIZ = '11111111-1111-4111-8111-111111111111';
const STAFF = '22222222-2222-4222-8222-222222222222';

const appointmentRow = {
  id: 'a1',
  business_id: BIZ,
  client_id: 'c1',
  staff_id: STAFF,
  service_id: 's1',
  slot: '["2026-09-30 07:00:00+00","2026-09-30 08:00:00+00")',
  blocked: '["2026-09-30 07:00:00+00","2026-09-30 08:15:00+00")',
  status: 'confirmed',
  source: 'app',
  price_cents: 100,
  duration_minutes: 60,
  notes: null,
  idempotency_key: 'k',
  checked_in_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_by: 'u',
  created_at: '2026-09-28 06:00:00+00',
};

describe('Supabase repository', () => {
  it('queries busy ranges scoped by business with a range overlap filter', async () => {
    const { db, requests } = fakeDb(() => ({ body: [{ id: 'a1', staff_id: STAFF, blocked: appointmentRow.blocked }] }));
    const repo = createSupabaseRepository(db);
    const busy = await repo.listBusy(BIZ, [STAFF], '2026-09-29T22:00:00.000Z', '2026-09-30T22:00:00.000Z');
    expect(busy).toHaveLength(1);
    const req = requests[0]!;
    expect(req.path).toBe('/appointments');
    expect(req.params.get('business_id')).toBe(`eq.${BIZ}`);
    expect(req.params.get('staff_id')).toBe(`in.(${STAFF})`);
    expect(req.params.get('status')).toBe('neq.cancelled');
    expect(req.params.get('blocked')).toBe('ov.[2026-09-29T22:00:00.000Z,2026-09-30T22:00:00.000Z)');
  });

  it('skips the query entirely for no staff', async () => {
    const { db, requests } = fakeDb(() => ({ body: [] }));
    expect(await createSupabaseRepository(db).listBusy(BIZ, [], 'a', 'b')).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('filters upcoming appointments by lower(slot) > now', async () => {
    const { db, requests } = fakeDb(() => ({ body: [appointmentRow] }));
    await createSupabaseRepository(db).listUpcomingAppointments(BIZ, 'c1', '2026-09-28T06:00:00.000Z');
    const req = requests[0]!;
    expect(req.params.get('slot')).toBe('sr.[2026-09-28T06:00:00.000Z,2026-09-28T06:00:00.000Z]');
    expect(req.params.get('status')).toBe('eq.confirmed');
    expect(req.params.get('business_id')).toBe(`eq.${BIZ}`);
  });

  it('calls create_appointment with the contract parameter names', async () => {
    const { db, requests } = fakeDb(() => ({ body: appointmentRow }));
    const row = await createSupabaseRepository(db).createAppointment({
      businessId: BIZ,
      clientId: 'c1',
      staffId: STAFF,
      serviceId: 's1',
      startsAt: '2026-09-30T07:00:00.000Z',
      source: 'web',
      idempotencyKey: 'web:k',
      actor: 'customer',
      actorId: 'c1',
      notes: null,
    });
    expect(row.id).toBe('a1');
    expect(requests[0]!.path).toBe('/rpc/create_appointment');
    expect(requests[0]!.body).toEqual({
      p_business_id: BIZ,
      p_client_id: 'c1',
      p_staff_id: STAFF,
      p_service_id: 's1',
      p_starts_at: '2026-09-30T07:00:00.000Z',
      p_source: 'web',
      p_idempotency_key: 'web:k',
      p_actor: 'customer',
      p_actor_id: 'c1',
    });
  });

  it('accepts RPC rows returned as a one-element array', async () => {
    const { db } = fakeDb(() => ({ body: [appointmentRow] }));
    const row = await createSupabaseRepository(db).cancelAppointment({ appointmentId: 'a1', reason: null, actor: 'staff', actorId: 'u' });
    expect(row.id).toBe('a1');
  });

  it('maps SQLSTATE errors from RPCs', async () => {
    const { db } = fakeDb(() => ({ status: 409, body: { code: '23P01', message: 'conflicting key value', details: null, hint: null } }));
    const err = await createSupabaseRepository(db)
      .rescheduleAppointment({ appointmentId: 'a1', startsAt: '2026-09-30T07:00:00Z', staffId: null, actor: 'staff', actorId: 'u' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('SLOT_UNAVAILABLE');
  });

  it('scopes updates by business id', async () => {
    const { db, requests } = fakeDb(() => ({ body: null }));
    expect(await createSupabaseRepository(db).updateService(BIZ, 's1', { is_active: false })).toBeNull();
    expect(requests[0]!.method).toBe('PATCH');
    expect(requests[0]!.params.get('business_id')).toBe(`eq.${BIZ}`);
    expect(requests[0]!.params.get('id')).toBe('eq.s1');
  });

  it('counts deleted rows for the maintenance job', async () => {
    const { db, requests } = fakeDb(() => ({ status: 200, body: [], headers: { 'content-range': '*/3' } }));
    expect(await createSupabaseRepository(db).deleteExpiredIdempotencyKeys('2026-09-28T06:00:00.000Z')).toBe(3);
    expect(requests[0]!.method).toBe('DELETE');
    expect(requests[0]!.params.get('expires_at')).toBe('lt.2026-09-28T06:00:00.000Z');
  });

  it('dedupes webhook events on unique violation', async () => {
    const existing = { id: 'w1', source: 'clerk', event_key: 'msg_1', payload: {}, received_at: 'x', processed_at: 'y', error: null, attempts: 1 };
    const { db } = fakeDb((req) =>
      req.method === 'POST'
        ? { status: 409, body: { code: '23505', message: 'duplicate key', details: null, hint: null } }
        : { body: existing },
    );
    const res = await createSupabaseRepository(db).recordWebhookEvent('clerk', 'msg_1', {});
    expect(res).toEqual({ row: existing, duplicate: true });
  });
});

describe('completeOnboarding', () => {
  const input = {
    businessId: BIZ,
    userId: 'user_1',
    ownerName: 'Kobus',
    hours: [{ weekday: 1, opens_at: '09:00', closes_at: '17:00' }],
    team: [{ name: 'Naledi', title: null }],
    services: [{ name: 'Cut', duration_minutes: 30, price_cents: 100 }],
  };

  it('calls the single complete_onboarding RPC and reports whether it applied', async () => {
    const { db, requests } = fakeDb(() => ({ body: true }));
    expect(await createSupabaseRepository(db).completeOnboarding(input)).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.path).toBe('/rpc/complete_onboarding');
    expect(requests[0]!.body).toEqual({
      p_business_id: BIZ,
      p_user_id: 'user_1',
      p_owner_name: 'Kobus',
      p_hours: input.hours,
      p_team: input.team,
      p_services: input.services,
    });
    const already = fakeDb(() => ({ body: false }));
    expect(await createSupabaseRepository(already.db).completeOnboarding(input)).toBe(false);
  });

  describe('schedule (special days, breaks, time off)', () => {
    const OTHER = '33333333-3333-4333-8333-333333333333';

    it('scopes special days by business and date range', async () => {
      const { db, requests } = fakeDb(() => ({ body: [] }));
      await createSupabaseRepository(db).listSpecialDays(BIZ, '2026-10-01', '2026-10-31');
      const req = requests[0]!;
      expect(req.path).toBe('/business_special_days');
      expect(req.params.get('business_id')).toBe(`eq.${BIZ}`);
      expect(req.params.getAll('date')).toEqual(['gte.2026-10-01', 'lte.2026-10-31']);
    });

    it('turns a second special day on a date into VALIDATION_FAILED', async () => {
      const { db } = fakeDb(() => ({ status: 409, body: { code: '23505', message: 'duplicate key value violates unique constraint' } }));
      const values = { date: '2026-10-09', name: 'X', kind: 'closure' as const, is_closed: true, start_time: null, end_time: null };
      await expect(createSupabaseRepository(db).insertSpecialDay(BIZ, values)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('calls replace_staff_breaks by parameter name and maps an overlap to a rule violation', async () => {
      const ok = fakeDb(() => ({ body: [{ id: 'b1', business_id: BIZ, staff_id: STAFF, label: 'Lunch', start_time: '12:00:00', end_time: '13:00:00', weekdays: [1] }] }));
      const breaks = [{ label: 'Lunch', start_time: '12:00', end_time: '13:00', weekdays: [1] }];
      const rows = await createSupabaseRepository(ok.db).replaceStaffBreaks(BIZ, STAFF, breaks);
      expect(rows).toHaveLength(1);
      expect(ok.requests[0]).toMatchObject({ path: '/rpc/replace_staff_breaks', body: { p_staff_id: STAFF, p_rows: breaks } });

      const overlap = fakeDb(() => ({ status: 400, body: { code: 'P0001', message: 'RULE:OVERLAPPING_BREAKS:Breaks on the same day overlap' } }));
      await expect(createSupabaseRepository(overlap.db).replaceStaffBreaks(BIZ, STAFF, breaks)).rejects.toMatchObject({
        code: 'RULE_VIOLATION',
        details: { rule: 'OVERLAPPING_BREAKS' },
      });
    });

    it('lists time off overlapping the range for the given staff, scoped by business', async () => {
      const { db, requests } = fakeDb(() => ({ body: [] }));
      await createSupabaseRepository(db).listTimeOff(BIZ, '2026-10-01', '2026-10-31', [STAFF, OTHER]);
      const req = requests[0]!;
      expect(req.path).toBe('/staff_time_off');
      expect(req.params.get('business_id')).toBe(`eq.${BIZ}`);
      expect(req.params.get('starts_on')).toBe('lte.2026-10-31');
      expect(req.params.get('ends_on')).toBe('gte.2026-10-01');
      expect(req.params.get('staff_id')).toBe(`in.(${STAFF},${OTHER})`);
    });

    it('skips the query for an empty staff filter and breaks for no staff', async () => {
      const { db, requests } = fakeDb(() => ({ body: [] }));
      const repo = createSupabaseRepository(db);
      expect(await repo.listTimeOff(BIZ, 'a', 'b', [])).toEqual([]);
      expect(await repo.listStaffBreaks(BIZ, [])).toEqual([]);
      expect(requests).toHaveLength(0);
    });

    it('scopes time off deletes by business and reports whether a row was removed', async () => {
      const { db, requests } = fakeDb(() => ({ status: 200, body: [], headers: { 'content-range': '*/1' } }));
      expect(await createSupabaseRepository(db).deleteTimeOff(BIZ, 'row-1')).toBe(true);
      expect(requests[0]!.params.get('business_id')).toBe(`eq.${BIZ}`);
      expect(requests[0]!.params.get('id')).toBe('eq.row-1');
    });
  });

  it('maps a database error', async () => {
    const { db } = fakeDb(() => ({ status: 404, body: { code: 'P0002', message: 'business not found' } }));
    await expect(createSupabaseRepository(db).completeOnboarding(input)).rejects.toBeInstanceOf(AppError);
  });
});
