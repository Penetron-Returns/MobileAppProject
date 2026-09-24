/**
 * End-to-end scripts: signed webhook → engine → fake Graph client, with the
 * real BookingService over WS-B's in-memory repository (availability,
 * idempotency, exclusion constraint and cancellation window are all real).
 */
import { describe, expect, it } from 'vitest';

import { createMemoryRepository, type MemoryRepository } from '../../src/booking/memoryRepository.ts';
import { DEFAULT_BOOKING_RULES, type ServiceRow, type StaffRow } from '../../src/booking/rows.ts';
import { createBookingServiceFromRepository } from '../../src/booking/service.ts';
import type { AppointmentChangedEvent } from '../../src/ports.ts';
import { handleFlowRequest } from '../../src/whatsapp/flows/handler.ts';
import { verifyFlowToken } from '../../src/whatsapp/flows/token.ts';
import { appHarness, BIZ, buttonMsg, CUSTOMER_PHONE, inbound, listMsg, nextWamid, nfmMsg, NOW, sentIds, sentText, silentLogger, textMsg } from './fakes.ts';

interface Salon {
  booking: MemoryRepository;
  cut: ServiceRow;
  thandi: StaffRow;
  sipho: StaffRow;
  events: AppointmentChangedEvent[];
}

/** Mon–Fri 09:00–17:00, two staff for a 60-minute Cut, 30-minute grid. */
function salon(clock: { now: Date }): Salon {
  const booking = createMemoryRepository({ now: () => clock.now });
  booking.tables.businesses.push({
    id: BIZ,
    clerk_org_id: 'org_wa_test',
    name: 'Nadia Hair',
    slug: 'nadia-hair',
    timezone: 'Africa/Johannesburg',
    currency: 'ZAR',
    logo_url: null,
    address: null,
    phone: null,
    email: null,
    booking_rules: { ...DEFAULT_BOOKING_RULES, slot_interval_minutes: 30 },
  });
  for (const weekday of [1, 2, 3, 4, 5]) booking.tables.business_hours.push({ business_id: BIZ, weekday, opens_at: '09:00:00', closes_at: '17:00:00' });
  const cut: ServiceRow = {
    id: booking.nextId(),
    business_id: BIZ,
    name: 'Cut',
    description: null,
    category: null,
    duration_minutes: 60,
    price_cents: 25000,
    deposit_cents: 0,
    is_active: true,
    sort_order: 0,
  };
  booking.tables.services.push(cut);
  const person = (name: string, sort_order: number): StaffRow => ({
    id: booking.nextId(),
    business_id: BIZ,
    user_id: null,
    name,
    title: null,
    photo_url: null,
    phone: null,
    email: null,
    color: null,
    is_active: true,
    accepts_bookings: true,
    sort_order,
  });
  const thandi = person('Thandi', 1);
  const sipho = person('Sipho', 2);
  booking.tables.staff.push(thandi, sipho);
  for (const s of [thandi, sipho]) booking.tables.staff_services.push({ business_id: BIZ, staff_id: s.id, service_id: cut.id });
  return { booking, cut, thandi, sipho, events: [] };
}

function setup(account: Parameters<typeof appHarness>[0] = {}) {
  const h = appHarness(account);
  const s = salon(h.clock);
  const booking = createBookingServiceFromRepository({
    repository: s.booking,
    notifications: { appointmentChanged: async (e) => void s.events.push(e) },
    logger: silentLogger,
    clock: () => h.clock.now,
  });
  h.deps.booking = booking;
  // One client table: the WhatsApp side upserts through the booking repository's RPC semantics.
  h.repo.upsertClientByPhone = async (businessId, phone, name) => {
    const c = await s.booking.upsertClientByPhone(businessId, phone, name);
    const row = { id: c.id, business_id: c.business_id, phone_e164: c.phone_e164, name: c.name, email: c.email, is_blocked: c.is_blocked, whatsapp_opt_in: c.whatsapp_opt_in };
    const existing = h.repo.db.clients.find((x) => x.id === c.id);
    if (existing) Object.assign(existing, row);
    else h.repo.db.clients.push(row);
    return row;
  };
  const send = (message: Record<string, unknown>) => h.webhook(inbound(message));
  return { h, s, send };
}

describe('e2e: list booking path', () => {
  it('books through menu → service → staff → date → slot → confirm, exactly once', async () => {
    const { h, s, send } = setup();

    await send(textMsg());
    expect(sentIds(h.graph)).toEqual(['menu:book', 'menu:bookings', 'menu:help']);

    await send(buttonMsg('menu:book'));
    expect(sentIds(h.graph)).toEqual([`svc:${s.cut.id}`, 'nav:menu']);

    await send(listMsg(`svc:${s.cut.id}`));
    expect(sentIds(h.graph)).toEqual(['stf:any', `stf:${s.thandi.id}`, `stf:${s.sipho.id}`, 'nav:back', 'nav:menu']);

    await send(listMsg('stf:any'));
    const dates = sentIds(h.graph);
    // Today (Mon 28 Sep, 10:00) still has slots after the 60-minute lead time; weekends are closed.
    expect(dates.slice(0, 5)).toEqual(['day:2026-09-28', 'day:2026-09-29', 'day:2026-09-30', 'day:2026-10-01', 'day:2026-10-02']);
    expect(dates.slice(9)).toEqual(['days:more:1']);

    await send(listMsg('days:more:1'));
    expect(sentIds(h.graph)[0]).toBe('day:2026-10-09');

    await send(listMsg('day:2026-09-30'));
    const slots = sentIds(h.graph);
    expect(slots[0]).toBe('slot:2026-09-30T07:00:00.000Z|any');
    expect(slots.slice(9)).toEqual(['slots:more:1']);

    await send(listMsg(slots[0]!));
    expect(sentText(h.graph)).toContain('Please confirm your booking');
    expect(sentText(h.graph)).toContain('Price: R250.00');
    expect(sentIds(h.graph)).toEqual(['cfm:yes', 'cfm:no', 'nav:back']);

    const confirm = buttonMsg('cfm:yes');
    await send(confirm);
    await send(confirm); // Meta redelivers the same event

    const appts = s.booking.tables.appointments;
    expect(appts).toHaveLength(1);
    expect(appts[0]).toMatchObject({ source: 'whatsapp', status: 'confirmed', staff_id: s.thandi.id, idempotency_key: `wa:${confirm.id}` });
    expect(sentText(h.graph)).toContain("You're booked!");
    expect(sentIds(h.graph)).toEqual([`appt:${appts[0]!.id}`]);
    expect(h.repo.db.conversations[0]).toMatchObject({ state: 'idle', context: {} });
    expect(h.repo.db.appointmentEvents).toMatchObject([{ appointment_id: appts[0]!.id, type: 'confirmation_sent', payload: { kind: 'created', channel: 'session' } }]);
    expect(s.events).toMatchObject([{ kind: 'created', notifyCustomer: false, actor: { type: 'customer' } }]);

    const attempt = h.repo.db.attempts[0]!;
    expect(attempt).toMatchObject({ outcome: 'completed', appointment_id: appts[0]!.id });
    expect(attempt.steps.map((x) => x.step)).toEqual([
      'select_service',
      'select_staff',
      'select_date',
      'select_date',
      'select_slot',
      'confirm',
      'confirm',
      'completed',
    ]);
    // Every outbound message was stored.
    expect(h.repo.db.messages.filter((m) => m.direction === 'out')).toHaveLength(h.graph.sent.length);
  });

  it('re-offers slots with a fixed message when the slot is taken before confirming', async () => {
    const { h, s, send } = setup();
    await send(buttonMsg('menu:book'));
    await send(listMsg(`svc:${s.cut.id}`));
    await send(listMsg(`stf:${s.thandi.id}`));
    await send(listMsg('day:2026-09-30'));
    await send(listMsg(`slot:2026-09-30T07:00:00.000Z|${s.thandi.id}`));

    // Someone books Thandi at 09:00 through the app meanwhile.
    const other = await s.booking.upsertClientByPhone(BIZ, '+27829999999', null);
    await h.deps.booking.createAppointment({
      businessId: BIZ,
      clientId: other.id,
      serviceId: s.cut.id,
      staffId: s.thandi.id,
      startsAt: '2026-09-30T07:00:00.000Z',
      source: 'app',
      idempotencyKey: 'app:race',
      actor: { type: 'staff', id: 'user_staff' },
    });

    await send(buttonMsg('cfm:yes'));
    expect(sentText(h.graph)).toMatch(/^Sorry, that slot was just taken/);
    expect(sentIds(h.graph)[0]).toBe(`slot:2026-09-30T08:00:00.000Z|${s.thandi.id}`);
    expect(h.repo.db.conversations[0]!.state).toBe('select_slot');
    expect(h.repo.db.attempts[0]!.outcome).toBe('in_progress');
    expect(s.booking.tables.appointments).toHaveLength(1);
  });

  it('escalates on the third invalid input and then stays silent', async () => {
    const { h, send } = setup();
    await send(buttonMsg('menu:book'));
    await send(textMsg());
    await send(textMsg());
    expect(h.repo.db.conversations[0]!.invalid_input_count).toBe(2);
    await send(textMsg());
    expect(h.repo.db.conversations[0]!.state).toBe('escalated');
    expect(h.repo.db.escalations).toMatchObject([{ reason: 'unrecognised_input', status: 'open' }]);
    expect(h.pushes).toHaveLength(1);
    const sent = h.graph.sent.length;
    await send(textMsg());
    expect(h.graph.sent).toHaveLength(sent);
  });
});

describe('e2e: manage bookings', () => {
  async function booked(startsAt: string) {
    const ctx = setup();
    const client = await ctx.h.repo.upsertClientByPhone(BIZ, CUSTOMER_PHONE, null);
    const appt = await ctx.h.deps.booking.createAppointment({
      businessId: BIZ,
      clientId: client.id,
      serviceId: ctx.s.cut.id,
      staffId: ctx.s.sipho.id,
      startsAt,
      source: 'app',
      idempotencyKey: 'app:seed',
      actor: { type: 'staff', id: 'user_staff' },
    });
    return { ...ctx, appt };
  }

  it('cancels through My bookings with a confirmation', async () => {
    const { h, s, send, appt } = await booked('2026-10-01T09:00:00.000Z');
    await send(buttonMsg('menu:bookings'));
    expect(sentIds(h.graph)).toEqual([`appt:${appt.id}`, 'nav:menu']);
    await send(listMsg(`appt:${appt.id}`));
    expect(sentIds(h.graph)).toEqual([`appt:resched:${appt.id}`, `appt:cancel:${appt.id}`, 'nav:back']);
    await send(buttonMsg(`appt:cancel:${appt.id}`));
    await send(buttonMsg('cfm:yes'));
    expect(s.booking.tables.appointments[0]!.status).toBe('cancelled');
    expect(sentText(h.graph)).toMatch(/^Your booking has been cancelled/);
    expect(sentIds(h.graph)).toEqual(['menu:book']);
  });

  it('reschedules through the list path, keeping the staff member', async () => {
    const { h, s, send, appt } = await booked('2026-10-01T09:00:00.000Z');
    await send(buttonMsg(`appt:resched:${appt.id}`));
    expect(h.repo.db.conversations[0]!.state).toBe('reschedule_select_date');
    await send(listMsg('day:2026-10-02'));
    await send(listMsg(`slot:2026-10-02T08:00:00.000Z|${s.sipho.id}`));
    await send(buttonMsg('cfm:yes'));
    expect(s.booking.tables.appointments[0]).toMatchObject({ staff_id: s.sipho.id, status: 'confirmed' });
    expect(s.booking.tables.appointments[0]!.slot).toContain('2026-10-02T08:00:00.000Z');
    expect(sentText(h.graph)).toMatch(/^✅ Your booking has been moved/);
  });

  it('escalates changes inside the cancellation window', async () => {
    const { h, s, send, appt } = await booked('2026-09-29T07:00:00.000Z');
    await send(buttonMsg(`appt:cancel:${appt.id}`));
    expect(h.repo.db.escalations).toMatchObject([{ reason: 'cancellation_window' }]);
    expect(sentText(h.graph)).toContain("can't be changed online less than 24 hours");
    expect(s.booking.tables.appointments[0]!.status).toBe('confirmed');
  });
});

describe('e2e: Flow path', () => {
  it('books through the Flow and confirms in chat once', async () => {
    const { h, s, send } = setup({ account: { flow_ids: { booking: 'flow-1', reschedule: 'flow-2' } } });
    await send(buttonMsg('menu:book'));
    const flowMsg = h.graph.sent.at(-1)!.payload as any;
    expect(flowMsg.interactive.type).toBe('flow');
    const token = flowMsg.interactive.action.parameters.flow_token as string;
    const check = verifyFlowToken(h.deps.env.FLOW_TOKEN_SECRET!, token, NOW);
    expect(check.ok && check.claims).toMatchObject({ conversationId: h.repo.db.conversations[0]!.id, attemptId: h.repo.db.attempts[0]!.id });
    expect(h.repo.db.conversations[0]!.state).toBe('flow_booking');

    const ask = (screen: string, data: Record<string, unknown>) =>
      handleFlowRequest(h.deps, { version: '3.0', action: 'data_exchange', flow_token: token, screen, data });
    await handleFlowRequest(h.deps, { version: '3.0', action: 'INIT', flow_token: token });
    const sel = { service_id: s.cut.id, staff_id: 'any', date: '2026-09-30', slot: 'slot:2026-09-30T07:00:00.000Z|any' };
    const slotScreen = (await ask('DATE', sel)) as any;
    expect(slotScreen.body.data.slots[0].id).toBe(sel.slot);
    const done = (await ask('SUMMARY', { ...sel, name: 'Thandi', email: '' })) as any;
    const params = done.body.data.extension_message_response.params;
    expect(s.booking.tables.appointments).toHaveLength(1);
    expect(s.booking.tables.appointments[0]!.idempotency_key).toBe(`wa-flow:${token}:${sel.slot}`);

    // Meta sends the nfm_reply; a second (different wamid) completion must not double-confirm.
    await send(nfmMsg(params));
    await send(nfmMsg(params, nextWamid()));
    const confirmations = h.graph.sent.filter((m) => JSON.stringify(m.payload).includes("You're booked!"));
    expect(confirmations).toHaveLength(1);
    expect(h.repo.db.conversations[0]!.state).toBe('idle');
    expect(h.repo.db.attempts[0]!.outcome).toBe('completed');
  });
});
