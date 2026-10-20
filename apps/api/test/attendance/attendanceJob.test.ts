import { describe, expect, it } from 'vitest';

import { attendanceHarness, book, OWNER, at, STAFF, statusOf } from './attendanceHarness.ts';

describe('attendance cron job', () => {
  it('asks the staff member 10 minutes after the appointment ends, and only once', async () => {
    const h = attendanceHarness();
    const appt = await book(h); // 10:00-11:00

    expect(await h.attendance.runJob(at('11:09'))).toMatchObject({ created: 0, pushes: 0 });
    expect(await h.attendance.runJob(at('11:10'))).toMatchObject({ created: 1, pushes: 1 });
    expect(h.attendanceRepo.checks).toHaveLength(1);
    expect(h.attendanceRepo.checks[0]).toMatchObject({ appointment_id: appt, audience: 'staff', recipient_user_id: STAFF, status: 'pending' });
    expect(h.attendancePushes).toEqual([
      {
        businessId: h.business.id,
        userId: STAFF,
        message: {
          title: 'Appointment check',
          body: 'Did Nadia make it to their 10:00 Cut?',
          categoryId: 'attendance_check',
          data: { type: 'attendance_check', checkId: h.attendanceRepo.checks[0]!.id, appointmentId: appt },
        },
      },
    ]);

    // Same minute again, and later runs: no second question, no second push.
    expect(await h.attendance.runJob(at('11:10'))).toMatchObject({ created: 0, pushes: 0, escalated: 0 });
    expect(await h.attendance.runJob(at('11:40'))).toMatchObject({ created: 0, pushes: 0 });
    expect(h.attendanceRepo.checks).toHaveLength(1);
    expect(h.attendancePushes).toHaveLength(1);
    expect(h.attendanceRepo.checks[0]!.notified_at).toBe(at('11:10').toISOString());
  });

  it('silently completes a checked-in appointment without a question or a push', async () => {
    const h = attendanceHarness();
    const appt = await book(h);
    expect((await h.call('POST', `/v1/appointments/${appt}/check-in`)).status).toBe(200);

    expect(await h.attendance.runJob(at('11:10'))).toMatchObject({ completed: 1, created: 0, pushes: 0 });
    expect(statusOf(h, appt)).toBe('completed');
    expect(h.attendanceRepo.checks).toEqual([]);
    expect(h.attendancePushes).toEqual([]);
    const event = h.repo.tables.appointment_events.find((e) => e.appointment_id === appt && e.type === 'completed');
    expect(event).toMatchObject({ actor: 'system', actor_id: null });
  });

  it('skips cancelled, no_show and completed appointments and never marks no_show by itself', async () => {
    const h = attendanceHarness();
    const cancelled = await book(h, '09:00');
    const noShow = await book(h, '10:00');
    const completed = await book(h, '11:00');
    const plain = await book(h, '13:00'); // unanswered, not checked in
    await h.call('POST', `/v1/appointments/${cancelled}/cancel`, { body: {} });
    await h.call('POST', `/v1/appointments/${noShow}/status`, { body: { status: 'no_show' } });
    await h.call('POST', `/v1/appointments/${completed}/status`, { body: { status: 'completed' } });

    const counts = await h.attendance.runJob(at('14:30'));
    expect(counts).toMatchObject({ created: 1, completed: 0 });
    expect(h.attendanceRepo.checks.map((c) => c.appointment_id)).toEqual([plain]);
    expect(statusOf(h, plain)).toBe('confirmed');
    expect([statusOf(h, cancelled), statusOf(h, noShow), statusOf(h, completed)]).toEqual(['cancelled', 'no_show', 'completed']);
    // A day later, still unanswered: still confirmed, never no_show.
    await h.attendance.runJob(at('10:00', '2026-10-01'));
    expect(statusOf(h, plain)).toBe('confirmed');
  });

  it('asks about an appointment that ended 20 minutes ago', async () => {
    const h = attendanceHarness();
    await book(h); // ends 11:00
    expect(await h.attendance.runJob(at('11:20'))).toMatchObject({ created: 1, pushes: 1 });
  });

  it('never asks about an appointment that ended 3 hours ago (no backfill after a deploy or outage)', async () => {
    const h = attendanceHarness();
    await book(h); // ends 11:00
    expect(await h.attendance.runJob(at('14:00'))).toMatchObject({ created: 0, pushes: 0, escalated: 0 });
    expect(h.attendanceRepo.checks).toEqual([]);
    expect(h.attendancePushes).toEqual([]);
  });

  it('does not mark a question escalated when nobody has a device; it stays pending and unnotified', async () => {
    const h = attendanceHarness({ staffHasDevice: false });
    h.repo.tables.device_push_tokens = h.repo.tables.device_push_tokens.filter((t) => t.user_id !== OWNER);
    await book(h);
    expect(await h.attendance.runJob(at('11:10'))).toMatchObject({ created: 1, escalated: 0, pushes: 0 });
    await h.attendance.runJob(at('13:00'));
    expect(h.attendanceRepo.checks[0]).toMatchObject({ status: 'pending', notified_at: null, escalated_at: null });
  });

  it('measures escalation from notified_at: a question notified late is not escalated 60 minutes after creation', async () => {
    const h = attendanceHarness({ staffHasDevice: false });
    h.repo.tables.device_push_tokens = h.repo.tables.device_push_tokens.filter((t) => t.user_id !== OWNER);
    await book(h);
    await h.attendance.runJob(at('11:10')); // created, nobody reachable
    const { business_id } = h.repo.tables.device_push_tokens[0] ?? { business_id: h.business.id };
    h.repo.tables.device_push_tokens.push({ business_id, user_id: STAFF, token: 'ExponentPushToken[staff]', platform: 'ios' });
    await h.attendance.runJob(at('12:20')); // staff reachable now: notified at 12:20
    expect(h.attendanceRepo.checks[0]!.notified_at).toBe(at('12:20').toISOString());
    expect(await h.attendance.runJob(at('13:00'))).toMatchObject({ escalated: 0 }); // 100 min after created_at
    h.repo.tables.device_push_tokens.push({ business_id, user_id: OWNER, token: 'ExponentPushToken[owner]', platform: 'ios' });
    expect(await h.attendance.runJob(at('13:20'))).toMatchObject({ escalated: 1 });
    expect(h.attendanceRepo.checks[0]!.escalated_at).toBe(at('13:20').toISOString());
  });

  it('asks the owner for everyone in owner mode', async () => {
    const h = attendanceHarness();
    h.business.attendance_mode = 'owner';
    await book(h);
    await h.attendance.runJob(at('11:10'));
    expect(h.attendanceRepo.checks[0]).toMatchObject({ audience: 'owner', recipient_user_id: null });
    expect(h.attendancePushes.map((p) => p.userId)).toEqual([OWNER]);
  });

  it('escalates once to the owner when the staff member has not answered after 60 minutes', async () => {
    const h = attendanceHarness();
    await book(h);
    await h.attendance.runJob(at('11:10'));
    expect(await h.attendance.runJob(at('12:09'))).toMatchObject({ escalated: 0, pushes: 0 });

    expect(await h.attendance.runJob(at('12:10'))).toMatchObject({ escalated: 1, pushes: 1 });
    expect(h.attendanceRepo.checks[0]!.escalated_at).toBe(at('12:10').toISOString());
    expect(h.attendancePushes.map((p) => p.userId)).toEqual([STAFF, OWNER]);

    expect(await h.attendance.runJob(at('15:00'))).toMatchObject({ escalated: 0, pushes: 0 });
    expect(h.attendancePushes).toHaveLength(2);
  });

  it('escalates immediately when the staff member has no linked user', async () => {
    const h = attendanceHarness({ staffLinked: false });
    await book(h);
    expect(await h.attendance.runJob(at('11:10'))).toMatchObject({ created: 1, escalated: 1, pushes: 1 });
    expect(h.attendancePushes.map((p) => p.userId)).toEqual([OWNER]);
  });

  it('escalates immediately when the staff member has no push token', async () => {
    const h = attendanceHarness({ staffHasDevice: false });
    await book(h);
    expect(await h.attendance.runJob(at('11:10'))).toMatchObject({ created: 1, escalated: 1, pushes: 1 });
    expect(h.attendancePushes.map((p) => p.userId)).toEqual([OWNER]);
  });

  it('sends ONE grouped push when several questions are due together', async () => {
    const h = attendanceHarness();
    for (const hhmm of ['10:00', '11:00']) await book(h, hhmm);

    expect(await h.attendance.runJob(at('12:10'))).toMatchObject({ created: 2, pushes: 1 });
    expect(h.attendancePushes).toHaveLength(1);
    expect(h.attendancePushes[0]).toMatchObject({ userId: STAFF });
    expect(h.attendancePushes[0]!.message).toEqual({
      title: 'Appointment check',
      body: '2 clients to confirm',
      data: { type: 'attendance_batch', count: '2' },
    });
    expect(h.attendanceRepo.checks.every((c) => c.notified_at !== null)).toBe(true);
  });

  it('closes a question whose appointment was resolved elsewhere, without pushing', async () => {
    const h = attendanceHarness();
    const appt = await book(h);
    await h.attendance.runJob(at('11:10'));
    await h.call('POST', `/v1/appointments/${appt}/status`, { body: { status: 'completed' } });

    expect(await h.attendance.runJob(at('11:20'))).toMatchObject({ closed: 1, pushes: 0 });
    expect(h.attendanceRepo.checks[0]).toMatchObject({ status: 'answered', outcome: 'resolved_elsewhere', answered_by: null });
  });

  it('does not push an answered question again', async () => {
    const h = attendanceHarness();
    const appt = await book(h);
    await h.attendance.runJob(at('11:10'));
    const check = h.attendanceRepo.checks[0]!;
    expect((await h.call('POST', `/v1/attendance/${check.id}/answer`, { token: 'staff', body: { outcome: 'came' } })).status).toBe(200);

    expect(await h.attendance.runJob(at('13:00'))).toMatchObject({ escalated: 0, pushes: 0, created: 0 });
    expect(h.attendancePushes).toHaveLength(1);
    expect(statusOf(h, appt)).toBe('completed');
  });

  it('keeps questions pending until the end-of-day summary, then sends it once', async () => {
    const h = attendanceHarness();
    await book(h, '15:00'); // ends 16:00 Wednesday, hours 09:00-17:00
    await h.attendance.runJob(at('16:10'));
    await h.attendance.runJob(at('17:00'));
    const before = h.attendancePushes.length;

    await h.attendance.runJob(at('17:30')); // closing + 30 minutes
    const summaries = h.attendancePushes.slice(before).filter((p) => p.message.data.type === 'attendance_summary');
    expect(summaries.map((p) => [p.userId, p.message.body])).toEqual([
      [OWNER, '1 appointment still needs confirming'], // escalated at 17:10 + 60 min
      [STAFF, '1 appointment still needs confirming'],
    ]);
    expect(summaries[0]!.message.data).toEqual({ type: 'attendance_summary', count: '1' });

    await h.attendance.runJob(at('17:45'));
    expect(h.attendancePushes.filter((p) => p.message.data.type === 'attendance_summary')).toHaveLength(2);
    expect(h.attendanceRepo.checks[0]!.status).toBe('pending'); // questions never expire
  });

  it('is reachable at /cron/attendance behind the cron secret', async () => {
    const h = attendanceHarness();
    const denied = await h.app.request('/cron/attendance');
    expect(denied.status).toBe(401);
    const ok = await h.app.request('/cron/attendance', { headers: { 'x-cron-secret': 'cron-secret' } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toMatchObject({ job: 'attendance', result: { created: 0, pushes: 0, errors: 0 } });
  });
});
