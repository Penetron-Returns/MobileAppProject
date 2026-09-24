import { describe, expect, it } from 'vitest';

import { engineBusiness } from '../../src/whatsapp/engine/index.ts';
import { COPY } from '../../src/whatsapp/engine/copy.ts';
import { transition } from '../../src/whatsapp/engine/transition.ts';
import {
  dataKey,
  STATES,
  type Action,
  type ConvContext,
  type ConvState,
  type DataRequest,
  type EngineCtx,
  type EngineInput,
  type Snapshot,
  type Transition,
} from '../../src/whatsapp/engine/types.ts';
import { parseReplyId } from '../../src/whatsapp/ids.ts';
import type { OutMessage } from '../../src/whatsapp/messages.ts';
import {
  appointment,
  makeWorld,
  NOW,
  service,
  slot,
  STAFF_ALEX,
  STAFF_SAM,
  SVC_COLOUR,
  SVC_CUT,
  uuidN,
  type World,
} from './fakes.ts';

const CLIENT = '00000000-0000-4000-8000-0000000c1e17';
const CONV = '00000000-0000-4000-8000-00000000c0c0';
const ATTEMPT = '00000000-0000-4000-8000-0000000a7777';
const NEW_ATTEMPT = '00000000-0000-4000-8000-0000000a8888';
const APPT = '00000000-0000-4000-8000-00000000aaaa';

function resolve(world: World, req: DataRequest, now: Date): unknown {
  switch (req.kind) {
    case 'services':
      return world.services.filter((s) => s.is_active);
    case 'staff':
      return world.staff.filter((s) => (world.staffServices[req.serviceId] ?? []).includes(s.id));
    case 'days':
      return world.days;
    case 'slots':
      return (world.slots[req.date] ?? []).filter((s) => !req.staffId || s.staff_ids.includes(req.staffId));
    case 'upcoming':
      return world.appointments.filter((a) => a.client_id === CLIENT && a.status === 'confirmed' && Date.parse(a.starts_at) > now.getTime());
    case 'appointment':
      return world.appointments.find((a) => a.id === req.id) ?? null;
  }
}

function ctxFor(world: World, over: Partial<EngineCtx> = {}): EngineCtx {
  return {
    now: NOW,
    business: engineBusiness(world.business),
    conversationId: CONV,
    clientId: CLIENT,
    clientBlocked: false,
    flows: { booking: false, reschedule: false },
    inboundKey: 'wa:wamid.IN1',
    newAttemptId: NEW_ATTEMPT,
    data: {},
    ...over,
  };
}

/** Runs the pure transition, answering data needs from the world synchronously. */
function run(world: World, snap: Partial<Snapshot> & { state: ConvState }, input: EngineInput, over: Partial<EngineCtx> = {}): Transition {
  const ctx = ctxFor(world, over);
  const full: Snapshot = { context: {}, invalidInputCount: 0, ...snap };
  for (let i = 0; i < 50; i++) {
    const r = transition(full, input, ctx);
    if (!('need' in r)) return r;
    ctx.data[dataKey(r.need)] = resolve(world, r.need, ctx.now);
  }
  throw new Error('loop');
}

const sends = (t: Transition): OutMessage[] => t.actions.filter((a): a is Extract<Action, { type: 'send' }> => a.type === 'send').map((a) => a.message);
const only = <T extends Action['type']>(t: Transition, type: T) => t.actions.filter((a): a is Extract<Action, { type: T }> => a.type === type);
const ids = (m: OutMessage | undefined): string[] => {
  if (!m) return [];
  if (m.kind === 'buttons') return m.buttons.map((b) => b.id);
  if (m.kind === 'list') return m.sections.flatMap((s) => s.rows.map((r) => r.id));
  return [];
};
const bodyOf = (m: OutMessage | undefined) => (m?.kind === 'text' ? m.text : m && 'body' in m ? m.body : '');

const btn = (id: string): EngineInput => ({ kind: 'button', id });
const row = (id: string): EngineInput => ({ kind: 'list', id });
const TEXT: EngineInput = { kind: 'text' };

// A valid context for every state, so each can be re-rendered.
function stateContexts(world: World): Record<ConvState, ConvContext> {
  world.appointments.push(appointment({ id: APPT, client_id: CLIENT, starts_at: '2026-10-05T07:00:00.000Z' }));
  const base = { attemptId: ATTEMPT, serviceId: SVC_CUT };
  return {
    idle: {},
    closed: {},
    menu: {},
    escalated: { ackSent: true },
    flow_booking: { attemptId: ATTEMPT },
    flow_reschedule: { appointmentId: APPT },
    select_service: { attemptId: ATTEMPT, page: 0 },
    select_staff: { ...base, staffStep: true, page: 0 },
    select_date: { ...base, staffId: null, page: 0 },
    select_slot: { ...base, staffId: null, date: '2026-09-29', page: 0 },
    confirm: { ...base, staffId: null, date: '2026-09-29', startsAt: '2026-09-29T07:00:00.000Z', slotStaffId: null },
    manage_booking: { page: 0 },
    manage_appointment: { appointmentId: APPT },
    reschedule_select_date: { appointmentId: APPT, serviceId: SVC_CUT, staffId: STAFF_SAM, page: 0 },
    reschedule_select_slot: { appointmentId: APPT, serviceId: SVC_CUT, staffId: STAFF_SAM, date: '2026-09-29', page: 0 },
    reschedule_confirm: { appointmentId: APPT, serviceId: SVC_CUT, staffId: STAFF_SAM, date: '2026-09-29', startsAt: '2026-09-29T07:00:00.000Z', slotStaffId: STAFF_SAM },
    cancel_confirm: { appointmentId: APPT },
  };
}

describe('transition: every state × non-matching input kind', () => {
  const junkInputs: [string, EngineInput][] = [
    ['text', TEXT],
    ['unsupported', { kind: 'unsupported' }],
    ['malformed button id', btn('svc:not-a-uuid')],
    ['foreign list id', row('foo:bar')],
    ['garbage template payload', { kind: 'template_button', payload: 'STOP' }],
    ['invalid flow completion', { kind: 'flow_completed', valid: false, flow: 'booking', attemptId: null, appointmentId: null }],
  ];

  for (const state of STATES) {
    for (const [label, input] of junkInputs) {
      it(`${state} × ${label}`, () => {
        const world = makeWorld();
        const context = stateContexts(world)[state];
        const t = run(world, { state, context, invalidInputCount: 0 }, input, {
          flows: { booking: state === 'flow_booking', reschedule: state === 'flow_reschedule' },
        });
        if (state === 'idle' || state === 'closed') {
          expect(t.state).toBe('menu');
          expect(t.invalidInputCount).toBe(0);
          expect(ids(sends(t)[0])).toEqual(['menu:book', 'menu:bookings', 'menu:help']);
        } else if (state === 'escalated') {
          expect(t.state).toBe('escalated');
          expect(t.actions).toEqual([]);
        } else {
          expect(t.state).toBe(state);
          expect(t.invalidInputCount).toBe(1);
          const msgs = sends(t);
          expect(msgs).toHaveLength(1);
          expect(bodyOf(msgs[0]).startsWith(COPY.invalidPrefix)).toBe(true);
        }
      });
    }
  }
});

describe('transition: main menu', () => {
  it('opens the list path for Book when no flow is live', () => {
    const world = makeWorld();
    const t = run(world, { state: 'menu' }, btn('menu:book'));
    expect(t.state).toBe('select_service');
    expect(t.context.attemptId).toBe(NEW_ATTEMPT);
    expect(t.actions[0]).toEqual({ type: 'attempt_start', attemptId: NEW_ATTEMPT });
    expect(t.actions[1]).toMatchObject({ type: 'attempt_step', attemptId: NEW_ATTEMPT, step: 'select_service' });
    expect(ids(sends(t)[0])).toEqual([`svc:${SVC_CUT}`, `svc:${SVC_COLOUR}`, 'nav:menu']);
  });

  it('uses the booking Flow when it is live', () => {
    const t = run(makeWorld(), { state: 'menu' }, btn('menu:book'), { flows: { booking: true, reschedule: false } });
    expect(t.state).toBe('flow_booking');
    const msg = sends(t)[0];
    expect(msg).toMatchObject({ kind: 'flow', flow: 'booking', subject: NEW_ATTEMPT });
  });

  it('escalates Talk to us with one message and then stays silent', () => {
    const t = run(makeWorld(), { state: 'menu' }, btn('menu:help'));
    expect(t.state).toBe('escalated');
    expect(only(t, 'escalate')).toEqual([{ type: 'escalate', reason: 'customer_requested' }]);
    const again = run(makeWorld(), { state: 'escalated', context: t.context }, btn('menu:book'));
    expect(again.actions).toEqual([]);
  });

  it('sends exactly one ack when escalated by staff (no ack yet)', () => {
    const t = run(makeWorld(), { state: 'escalated', context: {} }, TEXT);
    expect(sends(t).map(bodyOf)).toEqual([COPY.escalatedAck]);
    expect(t.context.ackSent).toBe(true);
  });

  it('accepts menu ids from idle (old buttons)', () => {
    const t = run(makeWorld(), { state: 'idle' }, btn('menu:book'));
    expect(t.state).toBe('select_service');
  });

  it('says so when there are no upcoming bookings', () => {
    const t = run(makeWorld(), { state: 'menu' }, btn('menu:bookings'));
    expect(t.state).toBe('menu');
    expect(bodyOf(sends(t)[0])).toContain(COPY.noUpcoming);
  });

  it('abandons an active attempt when the customer jumps back to the menu', () => {
    const t = run(makeWorld(), { state: 'select_date', context: { attemptId: ATTEMPT, serviceId: SVC_CUT, staffId: null } }, row('nav:menu'));
    expect(t.state).toBe('menu');
    expect(only(t, 'attempt_finish')).toEqual([{ type: 'attempt_finish', attemptId: ATTEMPT, outcome: 'abandoned' }]);
  });
});

describe('transition: strikes', () => {
  it('re-prompts twice then escalates on the third invalid input', () => {
    const world = makeWorld();
    let snap: Snapshot = { state: 'menu', context: {}, invalidInputCount: 0 };
    const t1 = run(world, snap, TEXT);
    expect(t1.invalidInputCount).toBe(1);
    snap = { state: t1.state, context: t1.context, invalidInputCount: t1.invalidInputCount };
    const t2 = run(world, snap, TEXT);
    expect(t2.invalidInputCount).toBe(2);
    snap = { state: t2.state, context: t2.context, invalidInputCount: t2.invalidInputCount };
    const t3 = run(world, snap, { kind: 'unsupported' });
    expect(t3.state).toBe('escalated');
    expect(only(t3, 'escalate')).toEqual([{ type: 'escalate', reason: 'unrecognised_input' }]);
    expect(sends(t3).map(bodyOf)).toEqual([COPY.strikeEscalated]);
  });

  it('resets strikes after a valid input', () => {
    const t = run(makeWorld(), { state: 'menu', invalidInputCount: 2 }, btn('menu:book'));
    expect(t.invalidInputCount).toBe(0);
  });

  it('abandons the attempt when strikes escalate mid-booking', () => {
    const t = run(makeWorld(), { state: 'select_service', context: { attemptId: ATTEMPT }, invalidInputCount: 2 }, TEXT);
    expect(t.state).toBe('escalated');
    expect(only(t, 'attempt_finish')[0]).toMatchObject({ attemptId: ATTEMPT, outcome: 'abandoned' });
  });
});

describe('transition: list booking path', () => {
  it('shows staff (with No preference) when >1 staff and selection allowed', () => {
    const t = run(makeWorld(), { state: 'select_service', context: { attemptId: ATTEMPT } }, row(`svc:${SVC_CUT}`));
    expect(t.state).toBe('select_staff');
    expect(ids(sends(t)[0])).toEqual(['stf:any', `stf:${STAFF_SAM}`, `stf:${STAFF_ALEX}`, 'nav:back', 'nav:menu']);
  });

  it('skips staff when only one person does the service', () => {
    const t = run(makeWorld(), { state: 'select_service', context: { attemptId: ATTEMPT } }, row(`svc:${SVC_COLOUR}`));
    expect(t.state).toBe('select_date');
    expect(t.context.staffId).toBeNull();
  });

  it('skips staff when the business disallows staff selection', () => {
    const world = makeWorld();
    world.business.booking_rules.allow_staff_selection = false;
    const t = run(world, { state: 'select_service', context: { attemptId: ATTEMPT } }, row(`svc:${SVC_CUT}`));
    expect(t.state).toBe('select_date');
  });

  it('rejects a well-formed but unknown service id', () => {
    const t = run(makeWorld(), { state: 'select_service', context: { attemptId: ATTEMPT } }, row(`svc:${uuidN(99)}`));
    expect(t.state).toBe('select_service');
    expect(t.invalidInputCount).toBe(1);
  });

  it('walks staff → date → slot → confirm → create', () => {
    const world = makeWorld();
    const s1 = run(world, { state: 'select_staff', context: { attemptId: ATTEMPT, serviceId: SVC_CUT, staffStep: true } }, row(`stf:${STAFF_SAM}`));
    expect(s1.state).toBe('select_date');
    expect(ids(sends(s1)[0])).toEqual(['day:2026-09-29', 'day:2026-09-30', 'day:2026-10-01', 'nav:back', 'nav:menu']);

    const s2 = run(world, { state: s1.state, context: s1.context }, row('day:2026-09-29'));
    expect(s2.state).toBe('select_slot');
    expect(ids(sends(s2)[0])).toEqual([
      `slot:2026-09-29T07:00:00.000Z|${STAFF_SAM}`,
      `slot:2026-09-29T08:00:00.000Z|${STAFF_SAM}`,
      'nav:back',
      'nav:menu',
    ]);

    const s3 = run(world, { state: s2.state, context: s2.context }, row(`slot:2026-09-29T08:00:00.000Z|${STAFF_SAM}`));
    expect(s3.state).toBe('confirm');
    const confirm = sends(s3)[0]!;
    expect(ids(confirm)).toEqual(['cfm:yes', 'cfm:no', 'nav:back']);
    expect(bodyOf(confirm)).toContain('Time: 10:00'); // 08:00Z in Johannesburg
    expect(bodyOf(confirm)).toContain('With: Sam');

    const s4 = run(world, { state: s3.state, context: s3.context }, btn('cfm:yes'));
    expect(s4.state).toBe('confirm');
    expect(s4.context.busySince).toBe(NOW.toISOString());
    const create = only(s4, 'create_booking');
    expect(create).toEqual([
      { type: 'create_booking', serviceId: SVC_CUT, staffId: STAFF_SAM, startsAt: '2026-09-29T08:00:00.000Z', idempotencyKey: 'wa:wamid.IN1' },
    ]);
    expect(s4.actions.at(-1)?.type).toBe('create_booking');
  });

  it('treats a stale slot for the same date as "just taken" and re-offers (no strike)', () => {
    const t = run(
      makeWorld(),
      { state: 'select_slot', context: { attemptId: ATTEMPT, serviceId: SVC_CUT, staffId: null, date: '2026-09-29' } },
      row('slot:2026-09-29T12:00:00.000Z|any'),
    );
    expect(t.state).toBe('select_slot');
    expect(t.invalidInputCount).toBe(0);
    expect(bodyOf(sends(t)[0]).startsWith(COPY.slotTaken)).toBe(true);
  });

  it('rejects slots for another date or another staff member', () => {
    const ctx = { attemptId: ATTEMPT, serviceId: SVC_CUT, staffId: null, date: '2026-09-29' };
    expect(run(makeWorld(), { state: 'select_slot', context: ctx }, row('slot:2026-09-30T07:00:00.000Z|any')).invalidInputCount).toBe(1);
    expect(run(makeWorld(), { state: 'select_slot', context: ctx }, row(`slot:2026-09-29T07:00:00.000Z|${STAFF_SAM}`)).invalidInputCount).toBe(1);
  });

  it('cfm:no abandons the attempt and returns to the menu', () => {
    const t = run(makeWorld(), { state: 'confirm', context: stateContexts(makeWorld()).confirm }, btn('cfm:no'));
    expect(t.state).toBe('menu');
    expect(only(t, 'attempt_finish')[0]).toMatchObject({ outcome: 'abandoned' });
    expect(bodyOf(sends(t)[0])).toContain(COPY.bookingAborted);
  });

  it('ignores inputs while a booking is in flight (double tap)', () => {
    const ctx = { ...stateContexts(makeWorld()).confirm, busySince: NOW.toISOString() };
    const t = run(makeWorld(), { state: 'confirm', context: ctx }, btn('cfm:yes'));
    expect(only(t, 'create_booking')).toEqual([]);
    expect(sends(t).map(bodyOf)).toEqual([COPY.busy]);
  });

  it('nav:back walks backwards', () => {
    const world = makeWorld();
    const ctxs = stateContexts(world);
    expect(run(world, { state: 'confirm', context: ctxs.confirm }, btn('nav:back')).state).toBe('select_slot');
    expect(run(world, { state: 'select_slot', context: ctxs.select_slot }, row('nav:back')).state).toBe('select_date');
    expect(run(world, { state: 'select_date', context: { ...ctxs.select_date, staffStep: true } }, row('nav:back')).state).toBe('select_staff');
    expect(run(world, { state: 'select_date', context: ctxs.select_date }, row('nav:back')).state).toBe('select_service');
    expect(run(world, { state: 'select_staff', context: ctxs.select_staff }, row('nav:back')).state).toBe('select_service');
    expect(run(world, { state: 'manage_appointment', context: ctxs.manage_appointment }, btn('nav:back')).state).toBe('manage_booking');
    expect(run(world, { state: 'cancel_confirm', context: ctxs.cancel_confirm }, btn('nav:back')).state).toBe('manage_appointment');
    expect(run(world, { state: 'reschedule_select_date', context: ctxs.reschedule_select_date }, row('nav:back')).state).toBe('manage_appointment');
  });

  it('fails the attempt when no dates are open', () => {
    const world = makeWorld({ days: [] });
    const t = run(world, { state: 'select_staff', context: { attemptId: ATTEMPT, serviceId: SVC_CUT, staffStep: true } }, row('stf:any'));
    expect(t.state).toBe('menu');
    expect(only(t, 'attempt_finish')[0]).toMatchObject({ outcome: 'failed', errorCode: 'NO_AVAILABILITY' });
  });
});

describe('transition: paging', () => {
  it('pages services 9 + More, then the rest + Main menu', () => {
    const world = makeWorld({ services: Array.from({ length: 12 }, (_, i) => service(uuidN(i + 1, 'c'), `Service ${i + 1}`)) });
    const p0 = run(world, { state: 'menu' }, btn('menu:book'));
    const rows0 = ids(sends(p0)[0]);
    expect(rows0).toHaveLength(10);
    expect(rows0.at(-1)).toBe('svcs:more:1');
    const p1 = run(world, { state: p0.state, context: p0.context }, row('svcs:more:1'));
    expect(ids(sends(p1)[0])).toEqual([...world.services.slice(9).map((s) => `svc:${s.id}`), 'nav:menu']);
    expect(p1.context.page).toBe(1);
  });

  it('pages dates 9 at a time with "More dates"', () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const world = makeWorld({ days });
    const ctx = { attemptId: ATTEMPT, serviceId: SVC_CUT, staffId: null, page: 0 };
    const p0 = run(world, { state: 'select_staff', context: { ...ctx, staffStep: true } }, row('stf:any'));
    const r0 = ids(sends(p0)[0]);
    expect(r0).toHaveLength(10);
    expect(r0[9]).toBe('days:more:1');
    const msg = sends(p0)[0]!;
    expect(msg.kind === 'list' && msg.sections[1]!.rows[0]!.title).toBe(COPY.moreDates);
    const p1 = run(world, { state: 'select_date', context: p0.context }, row('days:more:1'));
    expect(ids(sends(p1)[0])[0]).toBe('day:2026-10-10');
    expect(ids(sends(p1)[0])[9]).toBe('days:more:2');
    const p2 = run(world, { state: 'select_date', context: p1.context }, row('days:more:2'));
    expect(ids(sends(p2)[0])).toEqual(['day:2026-10-19', 'day:2026-10-20', 'nav:back', 'nav:menu']);
    const bad = run(world, { state: 'select_date', context: p2.context }, row('days:more:3'));
    expect(bad.invalidInputCount).toBe(1);
  });

  it('pages slots and rejects a "more" id from another list', () => {
    const slots = Array.from({ length: 12 }, (_, i) => slot(new Date(Date.parse('2026-09-29T06:00:00.000Z') + i * 1800_000).toISOString()));
    const world = makeWorld({ slots: { '2026-09-29': slots } });
    const ctx = { attemptId: ATTEMPT, serviceId: SVC_CUT, staffId: null, date: '2026-09-29', page: 0 };
    const p1 = run(world, { state: 'select_slot', context: ctx }, row('slots:more:1'));
    expect(ids(sends(p1)[0])).toHaveLength(5); // 3 slots + back + menu
    expect(run(world, { state: 'select_slot', context: ctx }, row('days:more:1')).invalidInputCount).toBe(1);
  });
});

describe('transition: booking results', () => {
  const confirmCtx = () => stateContexts(makeWorld()).confirm;

  it('confirms and completes the attempt on success', () => {
    const world = makeWorld();
    const appt = appointment({ id: APPT, client_id: CLIENT, starts_at: '2026-09-29T07:00:00.000Z' });
    const t = run(world, { state: 'confirm', context: { ...confirmCtx(), busySince: NOW.toISOString() } }, {
      kind: 'booking_result',
      op: 'create',
      ok: true,
      appointment: appt,
    });
    expect(t.state).toBe('idle');
    expect(t.context).toEqual({});
    expect(only(t, 'attempt_finish')).toEqual([{ type: 'attempt_finish', attemptId: ATTEMPT, outcome: 'completed', appointmentId: APPT }]);
    const send = only(t, 'send')[0]!;
    expect(send.dedupeKey).toBe(`confirm:${APPT}:created`);
    expect(send.critical).toBe(true);
    expect(ids(send.message)).toEqual([`appt:${APPT}`]);
  });

  it('maps SLOT_UNAVAILABLE to "just taken" and re-offers slots for the same date', () => {
    const t = run(makeWorld(), { state: 'confirm', context: confirmCtx() }, { kind: 'booking_result', op: 'create', ok: false, code: 'SLOT_UNAVAILABLE' });
    expect(t.state).toBe('select_slot');
    expect(t.context.date).toBe('2026-09-29');
    expect(t.context.startsAt).toBeUndefined();
    expect(bodyOf(sends(t)[0]).startsWith(COPY.slotTaken)).toBe(true);
    expect(only(t, 'attempt_finish')).toEqual([]);
  });

  it('fails the attempt on other errors', () => {
    const t = run(makeWorld(), { state: 'confirm', context: confirmCtx() }, { kind: 'booking_result', op: 'create', ok: false, code: 'ERROR', detail: 'CLIENT_BLOCKED' });
    expect(t.state).toBe('menu');
    expect(only(t, 'attempt_finish')[0]).toMatchObject({ outcome: 'failed', errorCode: 'CLIENT_BLOCKED' });
  });
});

describe('transition: My bookings', () => {
  function worldWithAppt(startsAt = '2026-10-05T07:00:00.000Z') {
    const world = makeWorld();
    world.appointments.push(appointment({ id: APPT, client_id: CLIENT, starts_at: startsAt }));
    return world;
  }

  it('lists upcoming bookings', () => {
    const t = run(worldWithAppt(), { state: 'menu' }, btn('menu:bookings'));
    expect(t.state).toBe('manage_booking');
    const msg = sends(t)[0]!;
    expect(ids(msg)).toEqual([`appt:${APPT}`, 'nav:menu']);
    expect(msg.kind === 'list' && msg.sections[0]!.rows[0]).toMatchObject({ title: 'Mon 5 Oct 09:00', description: 'Haircut · Sam' });
  });

  it('opens appointment actions', () => {
    const t = run(worldWithAppt(), { state: 'manage_booking' }, row(`appt:${APPT}`));
    expect(t.state).toBe('manage_appointment');
    expect(ids(sends(t)[0])).toEqual([`appt:resched:${APPT}`, `appt:cancel:${APPT}`, 'nav:back']);
  });

  it('cancel → confirm → cancel_booking', () => {
    const world = worldWithAppt();
    const t = run(world, { state: 'manage_appointment', context: { appointmentId: APPT } }, btn(`appt:cancel:${APPT}`));
    expect(t.state).toBe('cancel_confirm');
    const t2 = run(world, { state: t.state, context: t.context }, btn('cfm:yes'));
    expect(only(t2, 'cancel_booking')).toEqual([{ type: 'cancel_booking', appointmentId: APPT }]);
    const t3 = run(world, { state: t2.state, context: t2.context }, {
      kind: 'booking_result',
      op: 'cancel',
      ok: true,
      appointment: { ...world.appointments[0]!, status: 'cancelled' },
    });
    expect(t3.state).toBe('idle');
    expect(ids(sends(t3)[0])).toEqual(['menu:book']);
  });

  it('escalates cancel inside the cancellation window', () => {
    const world = worldWithAppt('2026-09-28T20:00:00.000Z'); // 12h away, window is 24h
    const t = run(world, { state: 'manage_appointment', context: { appointmentId: APPT } }, btn(`appt:cancel:${APPT}`));
    expect(t.state).toBe('escalated');
    expect(only(t, 'escalate')).toEqual([{ type: 'escalate', reason: 'cancellation_window' }]);
    expect(bodyOf(sends(t)[0])).toContain('24 hours');
  });

  it('maps a CANCELLATION_WINDOW booking result to an escalation', () => {
    const t = run(worldWithAppt(), { state: 'cancel_confirm', context: { appointmentId: APPT } }, {
      kind: 'booking_result',
      op: 'cancel',
      ok: false,
      code: 'CANCELLATION_WINDOW',
    });
    expect(t.state).toBe('escalated');
    expect(only(t, 'escalate')[0]).toMatchObject({ reason: 'cancellation_window' });
  });

  it('reschedules through the list path keeping the same staff', () => {
    const world = worldWithAppt();
    const t = run(world, { state: 'manage_appointment', context: { appointmentId: APPT } }, btn(`appt:resched:${APPT}`));
    expect(t.state).toBe('reschedule_select_date');
    expect(t.context).toMatchObject({ appointmentId: APPT, serviceId: SVC_CUT, staffId: STAFF_SAM });
    const t2 = run(world, { state: t.state, context: t.context }, row('day:2026-09-30'));
    expect(t2.state).toBe('reschedule_select_slot');
    const t3 = run(world, { state: t2.state, context: t2.context }, row(`slot:2026-09-30T07:00:00.000Z|${STAFF_SAM}`));
    expect(t3.state).toBe('reschedule_confirm');
    const t4 = run(world, { state: t3.state, context: t3.context }, btn('cfm:yes'));
    expect(only(t4, 'reschedule_booking')).toEqual([
      { type: 'reschedule_booking', appointmentId: APPT, startsAt: '2026-09-30T07:00:00.000Z', staffId: STAFF_SAM },
    ]);
  });

  it('reschedules through the Flow when live', () => {
    const t = run(worldWithAppt(), { state: 'manage_appointment', context: { appointmentId: APPT } }, btn(`appt:resched:${APPT}`), {
      flows: { booking: true, reschedule: true },
    });
    expect(t.state).toBe('flow_reschedule');
    expect(sends(t)[0]).toMatchObject({ kind: 'flow', flow: 'reschedule', subject: `rs-${APPT}` });
  });

  it('routes reminder quick replies from any state', () => {
    const world = worldWithAppt();
    expect(run(world, { state: 'idle' }, { kind: 'template_button', payload: `appt:resched:${APPT}` }).state).toBe('reschedule_select_date');
    expect(run(world, { state: 'closed' }, { kind: 'template_button', payload: `appt:cancel:${APPT}` }).state).toBe('cancel_confirm');
    const keep = run(world, { state: 'idle' }, { kind: 'template_button', payload: `appt:keep:${APPT}` });
    expect(sends(keep).map(bodyOf)).toEqual([COPY.keepAck]);
  });

  it("refuses someone else's or a past appointment", () => {
    const world = makeWorld();
    world.appointments.push(appointment({ id: APPT, client_id: uuidN(5), starts_at: '2026-10-05T07:00:00.000Z' }));
    const t = run(world, { state: 'idle' }, { kind: 'template_button', payload: `appt:cancel:${APPT}` });
    expect(t.state).toBe('menu');
    expect(bodyOf(sends(t)[0])).toContain(COPY.apptUnavailable);
  });
});

describe('transition: flows, blocked clients', () => {
  it('confirms a completed booking Flow and closes the attempt', () => {
    const world = makeWorld();
    world.appointments.push(appointment({ id: APPT, client_id: CLIENT, starts_at: '2026-10-05T07:00:00.000Z' }));
    const t = run(world, { state: 'flow_booking', context: { attemptId: ATTEMPT } }, {
      kind: 'flow_completed',
      valid: true,
      flow: 'booking',
      attemptId: ATTEMPT,
      appointmentId: APPT,
    });
    expect(t.state).toBe('idle');
    expect(only(t, 'attempt_finish')[0]).toMatchObject({ outcome: 'completed', appointmentId: APPT });
    expect(only(t, 'send')[0]!.dedupeKey).toBe(`confirm:${APPT}:created`);
  });

  it('still confirms a Flow completed after the customer moved on (state untouched)', () => {
    const world = makeWorld();
    world.appointments.push(appointment({ id: APPT, client_id: CLIENT, starts_at: '2026-10-05T07:00:00.000Z' }));
    const t = run(world, { state: 'escalated', context: { ackSent: true } }, {
      kind: 'flow_completed',
      valid: true,
      flow: 'booking',
      attemptId: ATTEMPT,
      appointmentId: APPT,
    });
    expect(t.state).toBe('escalated');
    expect(only(t, 'send')).toHaveLength(1);
  });

  it('sends blocked clients one fixed notice per 24h and nothing else', () => {
    const t = run(makeWorld(), { state: 'idle' }, btn('menu:book'), { clientBlocked: true });
    expect(sends(t).map(bodyOf)).toEqual([COPY.blocked]);
    const again = run(makeWorld(), { state: t.state, context: t.context }, btn('menu:book'), { clientBlocked: true });
    expect(again.actions).toEqual([]);
  });
});

describe('reply-id grammar', () => {
  it.each([
    ['menu:book', { t: 'menu', v: 'book' }],
    [`svc:${SVC_CUT}`, { t: 'svc', id: SVC_CUT }],
    ['stf:any', { t: 'stf', id: null }],
    ['day:2026-02-28', { t: 'day', date: '2026-02-28' }],
    ['days:more:2', { t: 'more', list: 'days', page: 2 }],
    [`slot:2026-09-29T07:00:00.000Z|${STAFF_SAM}`, { t: 'slot', startsAt: '2026-09-29T07:00:00.000Z', staffId: STAFF_SAM }],
    ['slot:2026-09-29T09:00:00+02:00|any', { t: 'slot', startsAt: '2026-09-29T09:00:00+02:00', staffId: null }],
    ['cfm:no', { t: 'cfm', yes: false }],
    [`appt:${APPT}`, { t: 'appt', action: 'open', id: APPT }],
    [`appt:resched:${APPT}`, { t: 'appt', action: 'resched', id: APPT }],
    [`appt:keep:${APPT}`, { t: 'appt', action: 'keep', id: APPT }],
    ['nav:back', { t: 'nav', v: 'back' }],
  ])('parses %s', (raw, expected) => {
    expect(parseReplyId(raw)).toEqual(expected);
  });

  it.each([
    '',
    'book',
    'menu:Book',
    'menu:book ',
    'svc:123',
    'stf:',
    'day:2026-02-30',
    'day:26-01-01',
    'days:more:-1',
    'days:more:01',
    'days:more:x',
    'slot:2026-09-29T07:00:00.000Z',
    'slot:tomorrow|any',
    `slot:2026-09-29T07:00:00.000Z|${STAFF_SAM}x`,
    'cfm:maybe',
    `appt:delete:${APPT}`,
    'nav:home',
    'hack:anything',
    `svc:${SVC_CUT}`.padEnd(201, 'x'),
  ])('rejects %j', (raw) => {
    expect(parseReplyId(raw)).toBeNull();
  });
});
