import { describe, expect, it } from 'vitest';

import type { Harness } from '../booking/harness.ts';
import { attendanceHarness, book, OWNER, at, sast, STAFF, statusOf } from './attendanceHarness.ts';

/** One unanswered staff-mode question for Thandi's 10:00 Cut. */
async function withQuestion(opts: Parameters<typeof attendanceHarness>[0] = {}) {
  const h = attendanceHarness(opts);
  const appointmentId = await book(h);
  await h.attendance.runJob(at('11:10'));
  const checkId = h.attendanceRepo.checks[0]!.id;
  return { h, appointmentId, checkId };
}

const answer = (h: Harness, checkId: string, token: 'owner' | 'staff' | 'invitee' | 'bad' | null, body: unknown, key?: string | null) =>
  h.call('POST', `/v1/attendance/${checkId}/answer`, { token, body, ...(key === undefined ? {} : { key }) });

describe('GET /v1/attendance/pending', () => {
  it('returns the recipient their own questions with a count', async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    const res = await h.call('GET', '/v1/attendance/pending', { token: 'staff' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      count: 1,
      checks: [
        {
          id: checkId,
          appointment_id: appointmentId,
          status: 'pending',
          outcome: null,
          audience: 'staff',
          escalated: false,
          created_at: at('11:10').toISOString(),
          answered_at: null,
          client_first_name: 'Nadia',
          service_name: 'Cut',
          starts_at: sast('10:00'),
          ends_at: sast('11:00'),
        },
      ],
    });
  });

  it('keeps another staff member and the owner (before escalation) out of a staff-mode question', async () => {
    const { h } = await withQuestion();
    expect((await h.call('GET', '/v1/attendance/pending', { token: 'invitee' })).body.data).toEqual({ count: 0, checks: [] });
    expect((await h.call('GET', '/v1/attendance/pending', { token: 'owner' })).body.data).toEqual({ count: 0, checks: [] });
  });

  it('shows the owner escalated questions and everything in owner mode', async () => {
    const { h } = await withQuestion();
    await h.attendance.runJob(at('12:10')); // 60 minutes later: escalated
    const escalated = await h.call('GET', '/v1/attendance/pending', { token: 'owner' });
    expect(escalated.body.data.count).toBe(1);
    expect(escalated.body.data.checks[0].escalated).toBe(true);

    const ownerMode = attendanceHarness();
    ownerMode.business.attendance_mode = 'owner';
    await book(ownerMode);
    await ownerMode.attendance.runJob(at('11:10'));
    expect((await ownerMode.call('GET', '/v1/attendance/pending', { token: 'owner' })).body.data.count).toBe(1);
    expect((await ownerMode.call('GET', '/v1/attendance/pending', { token: 'staff' })).body.data.count).toBe(0);
  });

  it('does not list questions whose appointment is no longer confirmed, or answered ones', async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    await h.call('POST', `/v1/appointments/${appointmentId}/cancel`, { body: {} });
    expect((await h.call('GET', '/v1/attendance/pending', { token: 'staff' })).body.data.count).toBe(0);
    expect(checkId).toBeTruthy();
  });

  it('requires authentication', async () => {
    const { h } = await withQuestion();
    expect((await h.call('GET', '/v1/attendance/pending', { token: null })).status).toBe(401);
    expect((await h.call('GET', '/v1/attendance/pending', { token: 'bad' })).status).toBe(401);
  });
});

describe('POST /v1/attendance/:checkId/answer', () => {
  it.each([
    ['came', 'completed'],
    ['no_show', 'no_show'],
  ] as const)('the recipient answers %s: the appointment becomes %s and the question closes', async (outcome, status) => {
    const { h, appointmentId, checkId } = await withQuestion();
    const res = await answer(h, checkId, 'staff', { outcome });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: checkId, status: 'answered', outcome });
    expect(statusOf(h, appointmentId)).toBe(status);
    expect(h.attendanceRepo.checks[0]).toMatchObject({ status: 'answered', outcome, answered_by: STAFF, answered_at: '2026-09-28T06:00:00.000Z' });
    const event = h.repo.tables.appointment_events.find((e) => e.appointment_id === appointmentId && e.type === status);
    expect(event).toMatchObject({ actor: 'staff', actor_id: STAFF });
    expect((await h.call('GET', '/v1/attendance/pending', { token: 'staff' })).body.data.count).toBe(0);
  });

  it('lets an owner answer any question in the business', async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    const res = await answer(h, checkId, 'owner', { outcome: 'no_show' });
    expect(res.status).toBe(200);
    expect(statusOf(h, appointmentId)).toBe('no_show');
    expect(h.attendanceRepo.checks[0]!.answered_by).toBe(OWNER);
  });

  it("forbids another staff member from answering someone else's question", async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    const res = await answer(h, checkId, 'invitee', { outcome: 'came' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(statusOf(h, appointmentId)).toBe('confirmed');
    expect(h.attendanceRepo.checks[0]!.status).toBe('pending');
  });

  it('returns 404 for an unknown question and for one that belongs to another business', async () => {
    const { h, checkId } = await withQuestion();
    expect((await answer(h, '00000000-0000-4000-8000-0000000000ff', 'owner', { outcome: 'came' })).status).toBe(404);
    h.attendanceRepo.checks[0]!.business_id = '00000000-0000-4000-8000-0000000000aa';
    expect((await answer(h, checkId, 'owner', { outcome: 'came' })).status).toBe(404);
  });

  it('rejects a bad outcome, a bad id and a missing key', async () => {
    const { h, checkId } = await withQuestion();
    expect((await answer(h, checkId, 'staff', { outcome: 'late' })).body.error.code).toBe('VALIDATION_FAILED');
    expect((await answer(h, checkId, 'staff', {})).status).toBe(400);
    expect((await answer(h, 'not-a-uuid', 'staff', { outcome: 'came' })).status).toBe(400);
    const noKey = await answer(h, checkId, 'staff', { outcome: 'came' }, null);
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(h.attendanceRepo.checks[0]!.status).toBe('pending');
  });

  it('replays the stored response for a repeated Idempotency-Key and changes the status once', async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    const first = await answer(h, checkId, 'staff', { outcome: 'came' }, 'att-key-1');
    const again = await answer(h, checkId, 'staff', { outcome: 'came' }, 'att-key-1');
    expect(again.status).toBe(first.status);
    expect(again.body).toEqual(first.body);
    expect(again.headers.get('idempotent-replay')).toBe('true');
    expect(h.repo.tables.appointment_events.filter((e) => e.appointment_id === appointmentId && e.type === 'completed')).toHaveLength(1);
  });

  it('treats the same answer with a new key as already done, and a different answer as a conflict', async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    await answer(h, checkId, 'staff', { outcome: 'came' });

    const same = await answer(h, checkId, 'staff', { outcome: 'came' });
    expect(same.status).toBe(200);
    expect(same.body.data.outcome).toBe('came');

    const different = await answer(h, checkId, 'owner', { outcome: 'no_show' });
    expect(different.status).toBe(422);
    expect(different.body.error).toMatchObject({ code: 'RULE_VIOLATION', details: { rule: 'ATTENDANCE_ALREADY_ANSWERED' } });
    expect(statusOf(h, appointmentId)).toBe('completed');
  });

  it('only closes the question when the appointment was changed elsewhere meanwhile', async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    await h.call('POST', `/v1/appointments/${appointmentId}/cancel`, { body: {} });

    const res = await answer(h, checkId, 'staff', { outcome: 'came' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'answered', outcome: 'resolved_elsewhere' });
    expect(statusOf(h, appointmentId)).toBe('cancelled');
    expect(h.attendanceRepo.checks[0]).toMatchObject({ status: 'answered', answered_by: STAFF });
  });

  it('closes the question when the status changes between the read and the write', async () => {
    const { h, appointmentId, checkId } = await withQuestion();
    const real = h.attendanceRepo.getCheck;
    h.attendanceRepo.getCheck = async (...args) => {
      const row = await real(...args);
      // someone else completes it right after we read it as confirmed
      await h.call('POST', `/v1/appointments/${appointmentId}/status`, { body: { status: 'completed' } });
      return row;
    };
    const res = await answer(h, checkId, 'staff', { outcome: 'no_show' });
    expect(res.status).toBe(200);
    expect(res.body.data.outcome).toBe('resolved_elsewhere');
    expect(statusOf(h, appointmentId)).toBe('completed');
  });
});

describe('attendance_mode setting', () => {
  it('is returned with the business and defaults to staff', async () => {
    const h = attendanceHarness();
    const res = await h.call('GET', '/v1/me');
    expect(res.body.data.business.attendance_mode).toBe('staff');
  });

  it('is changed by the owner and audited', async () => {
    const h = attendanceHarness();
    const res = await h.call('PATCH', '/v1/business', { body: { attendance_mode: 'owner' } });
    expect(res.status).toBe(200);
    expect(res.body.data.attendance_mode).toBe('owner');
    expect(h.business.attendance_mode).toBe('owner');
    expect(h.repo.tables.audit_events).toEqual([
      {
        businessId: h.business.id,
        actorId: 'user_owner',
        action: 'update',
        entity: 'attendance_mode',
        entityId: h.business.id,
        diff: { attendance_mode: { old: 'staff', new: 'owner' } },
      },
    ]);
  });

  it('writes no audit entry when the value does not change', async () => {
    const h = attendanceHarness();
    await h.call('PATCH', '/v1/business', { body: { attendance_mode: 'staff' } });
    expect(h.repo.tables.audit_events).toEqual([]);
  });

  it('cannot be changed by staff', async () => {
    const h = attendanceHarness();
    const res = await h.call('PATCH', '/v1/business', { token: 'staff', body: { attendance_mode: 'owner' } });
    expect(res.status).toBe(403);
    expect(h.business.attendance_mode).toBe('staff');
  });

  it('rejects values other than staff and owner', async () => {
    const h = attendanceHarness();
    const res = await h.call('PATCH', '/v1/business', { body: { attendance_mode: 'everyone' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('answering several questions at once', () => {
  it('saves three "came" answers tapped back to back, each with its own deterministic key', async () => {
    const h = attendanceHarness();
    const appointmentIds = [await book(h, '09:00'), await book(h, '10:00'), await book(h, '11:00')];
    await h.attendance.runJob(at('11:10'));
    await h.attendance.runJob(at('12:10'));
    const checks = h.attendanceRepo.checks;
    expect(checks).toHaveLength(3);

    const results = await Promise.all(
      checks.map((c) => answer(h, c.id, 'owner', { outcome: 'came' }, `attendance:${c.id}:came`)),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.map((r) => r.body.data.outcome)).toEqual(['came', 'came', 'came']);
    expect(appointmentIds.map((id) => statusOf(h, id))).toEqual(['completed', 'completed', 'completed']);
    expect(h.attendanceRepo.checks.every((c) => c.status === 'answered')).toBe(true);
  });

  it('reads the question once: no re-read after the write (fewer sequential round trips)', async () => {
    const { h, checkId } = await withQuestion();
    const real = h.attendanceRepo.getCheck;
    let reads = 0;
    h.attendanceRepo.getCheck = async (...args) => {
      reads += 1;
      return real(...args);
    };
    const res = await answer(h, checkId, 'staff', { outcome: 'came' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'answered', outcome: 'came', answered_at: '2026-09-28T06:00:00.000Z' });
    expect(reads).toBe(1);
  });
});
