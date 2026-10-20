import { describe, expect, it } from 'vitest';

import {
  planAttendance,
  type DueAppointment,
  type OpenCheck,
  type PlanBusiness,
  type PlanInput,
  type PlannedAction,
  type PlannedPush,
  type PushRecord,
} from '@booking/features/attendance/lib/planner.ts';

/** SAST (UTC+2) wall clock on Wednesday 2026-09-30, optionally another date. */
const sast = (hhmm: string, date = '2026-09-30') => new Date(`${date}T${hhmm}:00+02:00`);
const iso = (hhmm: string, date?: string) => sast(hhmm, date).toISOString();

const WEEKDAYS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, opens_at: '09:00:00', closes_at: '17:00:00' }));
const business = (over: Partial<PlanBusiness> = {}): PlanBusiness => ({
  timezone: 'Africa/Johannesburg',
  mode: 'staff',
  hours: WEEKDAYS,
  ownerIds: ['owner'],
  ...over,
});

/** Haircut 13:00-14:00 for Zanele with staff user "sam". */
const due = (over: Partial<DueAppointment> = {}): DueAppointment => ({
  appointmentId: 'appt-1',
  startsAt: iso('13:00'),
  endsAt: iso('14:00'),
  checkedInAt: null,
  staffUserId: 'sam',
  clientFirstName: 'Zanele Dlamini',
  serviceName: 'Haircut',
  ...over,
});

const open = (id: string, over: Partial<OpenCheck> = {}): OpenCheck => ({
  id,
  appointmentId: `appt-${id}`,
  audience: 'staff',
  recipientUserId: 'sam',
  notifiedAt: null,
  escalatedAt: null,
  startsAt: iso('11:00'),
  clientFirstName: 'Thabo',
  serviceName: 'Cut',
  ...over,
});

const push = (userId: string, hhmm: string, checkIds: string[], kind: PushRecord['kind'] = 'check', date = '2026-09-30'): PushRecord => ({
  userId,
  kind,
  checkIds,
  localDate: date,
  sentAt: iso(hhmm, date),
});

function plan(now: Date, over: Partial<PlanInput> = {}): PlannedAction[] {
  let n = 0;
  return planAttendance({
    now,
    business: business(),
    due: [],
    open: [],
    reachable: new Set(['sam', 'owner']),
    pushes: [],
    newId: () => `new-${++n}`,
    ...over,
  });
}

const pushes = (actions: PlannedAction[]) => actions.filter((a): a is PlannedPush => a.type === 'push');
/** Pushes to the staff member only (later times also escalate to the owner, which other tests cover). */
const samPushes = (actions: PlannedAction[]) => pushes(actions).filter((p) => p.userId === 'sam');
const types = (actions: PlannedAction[]) => actions.map((a) => a.type);

describe('trigger timing', () => {
  it.each([
    ['9 minutes after the end', '14:09', false],
    ['10 minutes after the end', '14:10', true],
    ['an hour after the end', '15:00', true],
  ])('%s', (_label, now, asks) => {
    const actions = plan(sast(now), { due: [due()] });
    expect(actions.some((a) => a.type === 'create_check')).toBe(asks);
  });

  it('asks the staff member, with the exact push text and payload', () => {
    const actions = plan(sast('14:10'), { due: [due()] });
    expect(actions[0]).toEqual({ type: 'create_check', checkId: 'new-1', appointmentId: 'appt-1', audience: 'staff', recipientUserId: 'sam' });
    expect(pushes(actions)).toEqual([
      {
        type: 'push',
        userId: 'sam',
        kind: 'check',
        checkIds: ['new-1'],
        localDate: '2026-09-30',
        message: {
          title: 'Appointment check',
          body: 'Did Zanele make it to their 13:00 Haircut?',
          categoryId: 'attendance_check',
          data: { type: 'attendance_check', checkId: 'new-1', appointmentId: 'appt-1' },
        },
      },
    ]);
  });

  it('uses business-local time in the text, not UTC', () => {
    const [p] = pushes(plan(sast('14:10'), { due: [due({ startsAt: '2026-09-30T11:30:00.000Z', endsAt: '2026-09-30T12:00:00.000Z' })] }));
    expect(p?.message.body).toContain('13:30');
  });

  it('falls back to a neutral name when the client has none', () => {
    const [p] = pushes(plan(sast('14:10'), { due: [due({ clientFirstName: null })] }));
    expect(p?.message.body).toBe('Did your client make it to their 13:00 Haircut?');
  });
});

describe('checked-in appointments', () => {
  it('are completed silently, with no question and no push', () => {
    const actions = plan(sast('14:10'), { due: [due({ checkedInAt: iso('13:02') })] });
    expect(actions).toEqual([{ type: 'complete', appointmentId: 'appt-1' }]);
  });

  it('are not completed before the ten minute delay', () => {
    expect(plan(sast('14:05'), { due: [due({ checkedInAt: iso('13:02') })] })).toEqual([]);
  });
});

describe('creation window', () => {
  it('asks about an appointment that ended 20 minutes ago', () => {
    expect(types(plan(sast('14:20'), { due: [due()] }))).toContain('create_check');
  });

  it('asks up to 90 minutes after the end, never later (no backfill)', () => {
    expect(types(plan(sast('15:30'), { due: [due()] }))).toContain('create_check');
    expect(plan(sast('15:31'), { due: [due()] })).toEqual([]);
    expect(plan(sast('17:00'), { due: [due()] })).toEqual([]); // ended 3 hours ago
  });
});

describe('who is asked', () => {
  it('owner mode asks the owner(s) for everyone', () => {
    const actions = plan(sast('14:10'), { business: business({ mode: 'owner', ownerIds: ['o1', 'o2'] }), reachable: new Set(['sam', 'o1', 'o2']), due: [due()] });
    expect(actions[0]).toMatchObject({ type: 'create_check', audience: 'owner', recipientUserId: null });
    expect(pushes(actions).map((p) => p.userId)).toEqual(['o1', 'o2']);
  });

  it('staff mode with nobody linked escalates at once and asks only the owner', () => {
    const actions = plan(sast('14:10'), { due: [due({ staffUserId: null })] });
    expect(types(actions)).toEqual(['create_check', 'escalate', 'push']);
    expect(pushes(actions).map((p) => p.userId)).toEqual(['owner']);
  });

  it('staff mode with a linked user who has no device escalates at once', () => {
    const actions = plan(sast('14:10'), { due: [due()], reachable: new Set(['owner']) });
    expect(types(actions)).toEqual(['create_check', 'escalate', 'push']);
    expect(pushes(actions).map((p) => p.userId)).toEqual(['owner']);
  });

  it('does not push anyone when nobody reachable exists', () => {
    expect(pushes(plan(sast('14:10'), { due: [due()], reachable: new Set() }))).toEqual([]);
  });
});

describe('escalation after 60 minutes', () => {
  const asked = [open('c1', { notifiedAt: iso('14:10') })];
  it.each([
    ['59 minutes after the first push', '15:09', false],
    ['60 minutes after the first push', '15:10', true],
  ])('%s', (_label, now, escalates) => {
    const actions = plan(sast(now), { open: asked, pushes: [push('sam', '14:10', ['c1'])] });
    expect(actions.some((a) => a.type === 'escalate')).toBe(escalates);
    if (escalates) expect(pushes(actions).map((p) => p.userId)).toEqual(['owner']);
  });

  it('waits when the staff member has not been pushed yet (for example outside opening hours)', () => {
    expect(plan(sast('15:10'), { open: [open('c1')], pushes: [] }).some((a) => a.type === 'escalate')).toBe(false);
  });

  it('is measured from notified_at, not from when the question was created', () => {
    // Pushed (and so notified) at 14:40; the question itself was created much earlier.
    const c = open('c1', { notifiedAt: iso('14:40') });
    expect(plan(sast('15:30'), { open: [c], pushes: [push('sam', '14:40', ['c1'])] }).some((a) => a.type === 'escalate')).toBe(false);
    expect(plan(sast('15:40'), { open: [c], pushes: [push('sam', '14:40', ['c1'])] }).some((a) => a.type === 'escalate')).toBe(true);
  });

  it('does not escalate when no owner has a device (nothing could be sent)', () => {
    const c = open('c1', { notifiedAt: iso('14:10') });
    expect(plan(sast('16:00'), { open: [c], reachable: new Set(['sam']) }).some((a) => a.type === 'escalate')).toBe(false);
    expect(plan(sast('14:10'), { due: [due()], reachable: new Set() }).some((a) => a.type === 'escalate')).toBe(false);
  });

  it('happens once: an escalated question is not escalated again', () => {
    const actions = plan(sast('16:30'), {
      open: [open('c1', { escalatedAt: iso('15:10') })],
      pushes: [push('sam', '14:10', ['c1']), push('owner', '15:10', ['c1'])],
    });
    expect(actions).toEqual([]);
  });

  it('an owner who is also the staff member gets one push, not two', () => {
    const actions = plan(sast('15:10'), {
      open: [open('c1', { recipientUserId: 'owner', notifiedAt: iso('14:10') })],
      pushes: [push('owner', '14:10', ['c1'])],
    });
    expect(types(actions)).toEqual(['escalate']);
  });

  it('owner-mode questions never escalate', () => {
    const actions = plan(sast('18:00'), {
      open: [open('c1', { audience: 'owner', recipientUserId: null })],
      pushes: [push('owner', '14:10', ['c1'])],
    });
    expect(actions.some((a) => a.type === 'escalate')).toBe(false);
  });
});

describe('batching and the 30 minute gap', () => {
  const three = [open('c1'), open('c2'), open('c3')];

  it('sends one grouped push for several fresh questions', () => {
    const actions = plan(sast('15:00'), { open: three });
    expect(pushes(actions)).toEqual([
      {
        type: 'push',
        userId: 'sam',
        kind: 'batch',
        checkIds: ['c1', 'c2', 'c3'],
        localDate: '2026-09-30',
        message: { title: 'Appointment check', body: '3 clients to confirm', data: { type: 'attendance_batch', count: '3' } },
      },
    ]);
  });

  it.each([
    ['29 minutes after the last push', '14:59', 0],
    ['30 minutes after the last push', '15:00', 1],
  ])('%s', (_label, now, count) => {
    const actions = plan(sast(now), { open: [open('c1'), open('c2')], pushes: [push('sam', '14:30', ['c0'])] });
    expect(pushes(actions)).toHaveLength(count);
  });

  it('does not re-push questions the recipient already knows about', () => {
    expect(samPushes(plan(sast('16:00'), { open: [open('c1')], pushes: [push('sam', '14:10', ['c1'])] }))).toEqual([]);
  });

  it('groups a new question with the ones already announced', () => {
    const [p] = pushes(plan(sast('15:00'), { open: [open('c1'), open('c2')], pushes: [push('sam', '14:10', ['c1'])] }));
    expect(p).toMatchObject({ kind: 'batch', checkIds: ['c1', 'c2'] });
  });

  it('a single answered question disappears from the batch (only open ones are planned)', () => {
    const [p] = pushes(plan(sast('15:00'), { open: [open('c1'), open('c2')] }));
    const [q] = pushes(plan(sast('15:00'), { open: [open('c2')] }));
    expect(p?.message.body).toBe('2 clients to confirm');
    expect(q).toMatchObject({ kind: 'check', checkIds: ['c2'] });
  });

  it('sends one push per recipient, each only with their own questions', () => {
    const actions = plan(sast('15:00'), { open: [open('c1', { recipientUserId: 'sam' }), open('c2', { recipientUserId: 'amy' })], reachable: new Set(['sam', 'amy', 'owner']) });
    expect(pushes(actions).map((p) => [p.userId, p.kind, p.checkIds])).toEqual([
      ['amy', 'check', ['c2']],
      ['sam', 'check', ['c1']],
    ]);
  });
});

describe('opening hours', () => {
  const pending = [open('c1')];
  it.each([
    ['before opening', '08:59', false],
    ['at opening', '09:00', true],
    ['at closing plus one hour', '18:00', true],
    ['after closing plus one hour', '18:01', false],
  ])('%s', (_label, now, sends) => {
    expect(pushes(plan(sast(now), { open: pending })).length > 0).toBe(sends);
  });

  it('creates the question after hours but waits to push until the next opening', () => {
    const evening = plan(sast('19:00'), { due: [due({ startsAt: iso('17:30'), endsAt: iso('18:30') })] });
    expect(types(evening)).toEqual(['create_check']);
    const morning = plan(sast('09:00', '2026-10-01'), { open: [open('c1')] });
    expect(pushes(morning)).toHaveLength(1);
  });

  it('has no restriction on a day without opening hours', () => {
    expect(pushes(plan(sast('06:00', '2026-10-04'), { open: pending }))).toHaveLength(1);
  });

  it('works across midnight in the business timezone (a question created at 00:15 waits for Thursday opening)', () => {
    const night = { hours: [...WEEKDAYS.slice(0, 2), { weekday: 3, opens_at: '09:00', closes_at: '24:00' }, ...WEEKDAYS.slice(3)] };
    const lateDue = due({ startsAt: iso('23:00'), endsAt: iso('23:50') });
    const justAfter = plan(new Date('2026-09-30T22:15:00.000Z'), { business: business(night), due: [lateDue] }); // 00:15 Thursday
    expect(types(justAfter)).toEqual(['create_check']);
    const evening = plan(sast('23:55'), { business: business(night), open: [open('c1')] }); // still Wednesday, within close + 1 h of 24:00
    expect(pushes(evening)).toHaveLength(1);
  });
});

describe('end-of-day summary', () => {
  const todays = [open('c1'), open('c2')];
  const notified = [push('sam', '14:10', ['c1', 'c2'], 'batch')];

  it.each([
    ['before closing plus 30 minutes', '17:29', false],
    ['at closing plus 30 minutes', '17:30', true],
    ['after the push window closed', '18:01', false],
  ])('%s', (_label, now, sends) => {
    const summary = pushes(plan(sast(now), { open: todays, pushes: notified })).filter((p) => p.kind === 'summary');
    expect(summary.length > 0).toBe(sends);
  });

  it('carries the count and the exact payload', () => {
    expect(samPushes(plan(sast('17:30'), { open: todays, pushes: notified }))).toEqual([
      {
        type: 'push',
        userId: 'sam',
        kind: 'summary',
        checkIds: ['c1', 'c2'],
        localDate: '2026-09-30',
        message: { title: 'Appointment check', body: '2 appointments still need confirming', data: { type: 'attendance_summary', count: '2' } },
      },
    ]);
  });

  it('uses the singular for one', () => {
    const [p] = pushes(plan(sast('17:30'), { open: [open('c1')], pushes: [push('sam', '14:10', ['c1'])] }));
    expect(p?.message.body).toBe('1 appointment still needs confirming');
  });

  it('is sent once per local day', () => {
    const sent = [...notified, push('sam', '17:30', ['c1', 'c2'], 'summary')];
    expect(samPushes(plan(sast('17:45'), { open: todays, pushes: sent }))).toEqual([]);
  });

  it('only counts questions about today in business-local time', () => {
    const yesterday = open('c0', { startsAt: iso('15:00', '2026-09-29') });
    const lateLastNightUtc = open('c9', { startsAt: '2026-09-30T22:30:00.000Z' }); // 00:30 on 1 October in Johannesburg
    const [p] = pushes(plan(sast('17:30'), { open: [yesterday, lateLastNightUtc, open('c1')], pushes: [push('sam', '14:10', ['c0', 'c1', 'c9'])] }));
    expect(p).toMatchObject({ kind: 'summary', checkIds: ['c1'] });
  });

  it('replaces the regular push for that recipient in the same run', () => {
    const [p, ...rest] = pushes(plan(sast('17:30'), { open: todays }));
    expect(p?.kind).toBe('summary');
    expect(rest).toEqual([]);
  });

  it('reaches the owner for escalated and owner-mode questions', () => {
    const actions = plan(sast('17:30'), {
      open: [open('c1', { escalatedAt: iso('15:10') }), open('c2', { audience: 'owner', recipientUserId: null })],
      pushes: [push('sam', '14:10', ['c1']), push('owner', '15:10', ['c1', 'c2'])],
    });
    expect(pushes(actions).map((p) => [p.userId, p.kind, p.checkIds])).toEqual([
      ['owner', 'summary', ['c1', 'c2']],
      ['sam', 'summary', ['c1']],
    ]);
  });

  it('is not sent on a day without opening hours', () => {
    const sunday = plan(sast('17:30', '2026-10-04'), { open: [open('c1', { startsAt: iso('11:00', '2026-10-04') })], pushes: [push('sam', '14:10', ['c1'], 'check', '2026-10-04')] });
    expect(samPushes(sunday)).toEqual([]);
  });

  it('follows daylight saving: London in summer closes at 17:00 BST', () => {
    const london = business({ timezone: 'Europe/London' });
    const at = (hhmm: string) => new Date(`2026-07-01T${hhmm}:00+01:00`);
    const check = open('c1', { startsAt: '2026-07-01T10:00:00.000Z' });
    const sent = [push('sam', '10:00', ['c1'])].map((p) => ({ ...p, sentAt: at('11:00').toISOString(), localDate: '2026-07-01' }));
    expect(samPushes(plan(at('17:29'), { business: london, open: [check], pushes: sent }))).toEqual([]);
    expect(samPushes(plan(at('17:30'), { business: london, open: [check], pushes: sent })).map((p) => p.kind)).toEqual(['summary']);
  });
});

describe('guarantees', () => {
  it('never produces a no_show or a completion for an appointment nobody confirmed', () => {
    const scenarios: Partial<PlanInput>[] = [
      { due: [due()] },
      { due: [due({ staffUserId: null })] },
      { open: [open('c1')], pushes: [push('sam', '14:10', ['c1'])] },
      { business: business({ mode: 'owner' }), due: [due(), due({ appointmentId: 'appt-2' })] },
    ];
    for (const s of scenarios) {
      for (const hhmm of ['14:10', '15:10', '17:30', '23:00']) {
        const actions = plan(sast(hhmm), s);
        expect(actions.filter((a) => a.type === 'complete')).toEqual([]);
        expect(JSON.stringify(actions)).not.toContain('no_show');
      }
    }
  });

  it('asks once per appointment: an appointment that already has a question is not asked again', () => {
    expect(plan(sast('14:10'), { due: [due()], open: [open('c1', { appointmentId: 'appt-1' })], pushes: [push('sam', '14:05', ['c1'])] })).toEqual([]);
  });

  it('is idempotent: re-running on the state it produced plans nothing new', () => {
    const first = plan(sast('14:10'), { due: [due(), due({ appointmentId: 'appt-2', staffUserId: null })] });
    const created = first.filter((a) => a.type === 'create_check');
    const escalated = new Set(first.filter((a) => a.type === 'escalate').map((a) => (a as { checkId: string }).checkId));
    const state = created.map((a) => {
      const c = a as Extract<PlannedAction, { type: 'create_check' }>;
      return open(c.checkId, { appointmentId: c.appointmentId, recipientUserId: c.recipientUserId, escalatedAt: escalated.has(c.checkId) ? iso('14:10') : null });
    });
    const sent = pushes(first).map((p) => push(p.userId, '14:10', p.checkIds, p.kind));
    expect(plan(sast('14:15'), { open: state, pushes: sent })).toEqual([]);
  });

  it('plans deterministically for the same inputs', () => {
    const input = { due: [due(), due({ appointmentId: 'appt-0', endsAt: iso('13:30') })] };
    expect(plan(sast('14:10'), input)).toEqual(plan(sast('14:10'), input));
  });
});
