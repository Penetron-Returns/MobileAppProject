/**
 * The deterministic conversation engine (BUILD_PLAN §5).
 *
 * `transition(snapshot, input, ctx)` is pure: no I/O, no clock, no randomness.
 * Everything it needs comes in through `ctx` (injected `now`, pre-generated
 * attempt id, pre-fetched data). When a piece of data is missing it returns
 * `{ need: DataRequest }`; the runner fetches it and calls again with the
 * same arguments plus the data (see run.ts). Free text is never read: a text
 * message is just `{ kind: 'text' }`.
 */
import type { AppointmentDTO } from '../../../../../packages/shared/api.ts';
import { durationWords, shortDate, timeOf, dateOf, money, summaryLines } from '../format.ts';
import { parseReplyId, rid, type MoreList, type ReplyId } from '../ids.ts';
import { buttons, flow, text, type OutMessage } from '../messages.ts';
import { COPY } from './copy.ts';
import {
  appointmentSummary,
  menuMessage,
  pagedList,
  serviceName,
  serviceRow,
  staffName,
  validPage,
  withLead,
} from './render.ts';
import {
  dataKey,
  type Action,
  type ConvContext,
  type ConvState,
  type DataRequest,
  type DataValues,
  type EngineCtx,
  type EngineInput,
  type Snapshot,
  type TransitionResult,
} from './types.ts';

export const MAX_STRIKES = 3;
const BUSY_MS = 60_000;
const BLOCKED_NOTICE_MS = 24 * 3600_000;

/** What a handler produces; finalize() turns it into a Transition. */
interface Out {
  state: ConvState;
  context: ConvContext;
  actions: Action[];
  /** New strike count; omitted = valid input (reset to 0) */
  invalid?: number;
}

class NeedData {
  constructor(readonly req: DataRequest) {}
}

type Kind = DataRequest['kind'];
function need<K extends Kind>(ctx: EngineCtx, req: Extract<DataRequest, { kind: K }>): DataValues[K] {
  const key = dataKey(req);
  if (!(key in ctx.data)) throw new NeedData(req);
  return ctx.data[key] as DataValues[K];
}

const send = (message: OutMessage, extra: Omit<Extract<Action, { type: 'send' }>, 'type' | 'message'> = {}): Action => ({
  type: 'send',
  message,
  ...extra,
});

export function transition(snap: Snapshot, input: EngineInput, ctx: EngineCtx): TransitionResult {
  try {
    return finalize(snap, step(snap, input, ctx), ctx);
  } catch (err) {
    if (err instanceof NeedData) return { need: err.req };
    throw err;
  }
}

// ---------------------------------------------------------------- dispatch

function step(snap: Snapshot, input: EngineInput, ctx: EngineCtx): Out {
  const c = snap.context;
  if (input.kind === 'booking_result') return onBookingResult(snap, input, ctx);
  if (ctx.clientBlocked) return onBlocked(snap, ctx);
  if (input.kind === 'flow_completed') {
    // A completed Flow means a booking already happened: always confirm it.
    const done = onFlowCompleted(snap, input, ctx);
    if (done) return done;
  }
  if (snap.state === 'escalated') return onEscalated(snap);
  if (c.busySince && ctx.now.getTime() - Date.parse(c.busySince) < BUSY_MS) {
    return { ...unchanged(snap), actions: [send(text(COPY.busy))] };
  }

  const id = replyIdOf(input);
  // Global inputs: valid in every (non-escalated) state.
  if (id?.t === 'menu') return onMenuChoice(id.v, ctx);
  if (id?.t === 'nav' && id.v === 'menu') return showMenu(ctx);
  if (id?.t === 'appt') return onAppointment(id, snap, ctx);

  if (snap.state === 'idle' || snap.state === 'closed') return showMenu(ctx);
  return (id ? onStateInput(id, snap, ctx) : null) ?? invalid(snap, ctx);
}

function replyIdOf(input: EngineInput): ReplyId | null {
  if (input.kind === 'button' || input.kind === 'list') return parseReplyId(input.id);
  if (input.kind === 'template_button') return parseReplyId(input.payload);
  return null;
}

function onStateInput(id: ReplyId, snap: Snapshot, ctx: EngineCtx): Out | null {
  const c = snap.context;
  const back = id.t === 'nav' && id.v === 'back';
  if (id.t === 'more') return onMore(id.list, id.page, snap, ctx);

  switch (snap.state) {
    case 'menu':
      return null;
    case 'flow_booking':
    case 'flow_reschedule':
      return back ? showMenu(ctx) : null;
    case 'select_service':
      if (back) return showMenu(ctx);
      if (id.t !== 'svc') return null;
      if (!need(ctx, { kind: 'services' }).some((s) => s.id === id.id)) return null;
      return enterStaff({ attemptId: c.attemptId, serviceId: id.id }, ctx);
    case 'select_staff': {
      if (back) return enterServices({ attemptId: c.attemptId }, ctx);
      if (id.t !== 'stf' || !c.serviceId) return null;
      const staff = need(ctx, { kind: 'staff', serviceId: c.serviceId });
      if (id.id !== null && !staff.some((s) => s.id === id.id)) return null;
      return enterDates('book', { ...c, staffId: id.id, page: 0 }, ctx);
    }
    case 'select_date':
    case 'reschedule_select_date': {
      const kind = snap.state === 'select_date' ? 'book' : 'resched';
      if (back) {
        if (kind === 'resched') return enterAppointment({ appointmentId: c.appointmentId }, ctx);
        return c.staffStep ? enterStaff({ attemptId: c.attemptId, serviceId: c.serviceId }, ctx) : enterServices({ attemptId: c.attemptId }, ctx);
      }
      if (id.t !== 'day') return null;
      return onDay(kind, id.date, c, ctx);
    }
    case 'select_slot':
    case 'reschedule_select_slot': {
      const kind = snap.state === 'select_slot' ? 'book' : 'resched';
      if (back) return enterDates(kind, { ...c, date: undefined, page: 0 }, ctx);
      if (id.t !== 'slot') return null;
      return onSlot(kind, id, c, ctx);
    }
    case 'confirm':
      if (back) return enterSlots('book', { ...c, startsAt: undefined, slotStaffId: undefined, page: 0 }, ctx);
      if (id.t !== 'cfm') return null;
      if (!id.yes) return showMenu(ctx, COPY.bookingAborted);
      if (!c.serviceId || !c.startsAt) return null;
      return {
        state: 'confirm',
        context: { ...c, busySince: ctx.now.toISOString() },
        actions: [
          {
            type: 'create_booking',
            serviceId: c.serviceId,
            staffId: c.slotStaffId ?? c.staffId ?? null,
            startsAt: c.startsAt,
            idempotencyKey: ctx.inboundKey,
          },
        ],
      };
    case 'reschedule_confirm':
      if (back) return enterSlots('resched', { ...c, startsAt: undefined, page: 0 }, ctx);
      if (id.t !== 'cfm') return null;
      if (!id.yes) return showMenu(ctx, COPY.keptUnchanged);
      if (!c.appointmentId || !c.startsAt) return null;
      return {
        state: 'reschedule_confirm',
        context: { ...c, busySince: ctx.now.toISOString() },
        actions: [
          { type: 'reschedule_booking', appointmentId: c.appointmentId, startsAt: c.startsAt, staffId: c.slotStaffId ?? c.staffId ?? null },
        ],
      };
    case 'cancel_confirm':
      if (back) return enterAppointment({ appointmentId: c.appointmentId }, ctx);
      if (id.t !== 'cfm') return null;
      if (!id.yes) return showMenu(ctx, COPY.keptUnchanged);
      if (!c.appointmentId) return null;
      return {
        state: 'cancel_confirm',
        context: { ...c, busySince: ctx.now.toISOString() },
        actions: [{ type: 'cancel_booking', appointmentId: c.appointmentId }],
      };
    case 'manage_booking':
      return back ? showMenu(ctx) : null;
    case 'manage_appointment':
      return back ? enterBookings({}, ctx) : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- global handlers

function showMenu(ctx: EngineCtx, lead?: string): Out {
  return { state: 'menu', context: {}, actions: [send(menuMessage(ctx.business.name, lead))] };
}

function onMenuChoice(choice: 'book' | 'bookings' | 'help', ctx: EngineCtx): Out {
  if (choice === 'help') {
    return {
      state: 'escalated',
      context: { ackSent: true },
      actions: [{ type: 'escalate', reason: 'customer_requested' }, send(text(COPY.helpEscalated))],
    };
  }
  if (choice === 'bookings') return enterBookings({}, ctx);

  const attemptId = ctx.newAttemptId;
  const start: Action = { type: 'attempt_start', attemptId };
  if (ctx.flows.booking) {
    return {
      state: 'flow_booking',
      context: { attemptId },
      actions: [start, send(flow('booking', COPY.flowBookBody, COPY.flowBookCta, attemptId))],
    };
  }
  if (need(ctx, { kind: 'services' }).length === 0) return showMenu(ctx, COPY.noServices);
  const out = enterServices({ attemptId }, ctx);
  return { ...out, actions: [start, ...out.actions] };
}

function isManageable(appt: AppointmentDTO | null, ctx: EngineCtx): appt is AppointmentDTO {
  return !!appt && appt.client_id === ctx.clientId && appt.status === 'confirmed' && Date.parse(appt.starts_at) > ctx.now.getTime();
}

function insideCancellationWindow(appt: AppointmentDTO, ctx: EngineCtx): boolean {
  const minutesLeft = (Date.parse(appt.starts_at) - ctx.now.getTime()) / 60_000;
  return minutesLeft < ctx.business.rules.cancellation_window_minutes;
}

function escalateWindow(ctx: EngineCtx): Out {
  return {
    state: 'escalated',
    context: { ackSent: true },
    actions: [
      { type: 'escalate', reason: 'cancellation_window' },
      send(text(COPY.cancellationWindow(durationWords(ctx.business.rules.cancellation_window_minutes)))),
    ],
  };
}

function onAppointment(id: Extract<ReplyId, { t: 'appt' }>, snap: Snapshot, ctx: EngineCtx): Out {
  const appt = need(ctx, { kind: 'appointment', id: id.id });
  if (!isManageable(appt, ctx)) return showMenu(ctx, COPY.apptUnavailable);
  switch (id.action) {
    case 'open':
      return enterAppointment({ appointmentId: appt.id }, ctx);
    case 'keep':
      return { state: snap.state, context: snap.context, actions: [send(text(COPY.keepAck))] };
    case 'cancel':
      if (insideCancellationWindow(appt, ctx)) return escalateWindow(ctx);
      return enterCancelConfirm({ appointmentId: appt.id }, ctx);
    case 'resched':
      if (insideCancellationWindow(appt, ctx)) return escalateWindow(ctx);
      if (ctx.flows.reschedule) {
        return {
          state: 'flow_reschedule',
          context: { appointmentId: appt.id },
          actions: [send(flow('reschedule', COPY.flowReschedBody, COPY.flowReschedCta, `rs-${appt.id}`))],
        };
      }
      return enterDates('resched', { appointmentId: appt.id, serviceId: appt.service_id, staffId: appt.staff_id, page: 0 }, ctx);
  }
}

function onFlowCompleted(snap: Snapshot, input: Extract<EngineInput, { kind: 'flow_completed' }>, ctx: EngineCtx): Out | null {
  if (input.valid && input.flow === 'booking' && input.booking && input.flowToken) return onFlowBooking(snap, input, ctx);
  if (input.valid && input.flow === 'reschedule' && input.reschedule && input.appointmentId && input.flowToken) return onFlowReschedule(snap, input, ctx);
  if (!input.valid || !input.appointmentId) return null;
  const appt = need(ctx, { kind: 'appointment', id: input.appointmentId });
  if (!appt || appt.client_id !== ctx.clientId) return null;
  const current =
    input.flow === 'booking'
      ? snap.state === 'flow_booking' && !!input.attemptId && snap.context.attemptId === input.attemptId
      : snap.state === 'flow_reschedule' && snap.context.appointmentId === appt.id;
  const actions: Action[] = [];
  if (current && input.attemptId) {
    actions.push({ type: 'attempt_finish', attemptId: input.attemptId, outcome: 'completed', appointmentId: appt.id });
  }
  actions.push(confirmationAction(input.flow === 'booking' ? 'created' : 'rescheduled', appt, ctx));
  // A completion for an older flow confirms the booking but leaves the current step alone.
  return current
    ? { state: 'idle', context: {}, actions }
    : { state: snap.state, context: snap.context, actions, invalid: snap.invalidInputCount };
}

/**
 * The booking Flow's SUMMARY `complete`: book through the port, re-validated
 * live. Only the open attempt can book; a stale completion changes nothing.
 */
function onFlowBooking(snap: Snapshot, input: Extract<EngineInput, { kind: 'flow_completed' }>, ctx: EngineCtx): Out {
  const { booking, attemptId, flowToken } = input;
  if (!booking || !flowToken) return unchanged(snap);
  if (snap.state !== 'flow_booking' || !attemptId || snap.context.attemptId !== attemptId) {
    return { state: snap.state, context: snap.context, actions: [send(text(COPY.flowStale))], invalid: snap.invalidInputCount };
  }
  return {
    state: 'flow_booking',
    context: { ...snap.context, busySince: ctx.now.toISOString() },
    actions: [
      {
        type: 'create_booking',
        serviceId: booking.serviceId,
        staffId: null,
        startsAt: booking.startsAt,
        idempotencyKey: `wa-flow:${attemptId}:${booking.startsAt}`,
      },
    ],
  };
}

/**
 * The reschedule Flow's SUMMARY `complete`: move the token's appointment
 * through the port, re-validated live (availability, lead time, cancellation
 * window). Only the open Flow can move it, and a target equal to the current
 * start is a retry of a move that already happened, so it only re-confirms.
 */
function onFlowReschedule(snap: Snapshot, input: Extract<EngineInput, { kind: 'flow_completed' }>, ctx: EngineCtx): Out {
  const { reschedule, appointmentId } = input;
  if (!reschedule || !appointmentId) return unchanged(snap);
  if (snap.state !== 'flow_reschedule' || snap.context.appointmentId !== appointmentId) {
    return { state: snap.state, context: snap.context, actions: [send(text(COPY.flowReschedStale))], invalid: snap.invalidInputCount };
  }
  const appt = need(ctx, { kind: 'appointment', id: appointmentId });
  if (appt && appt.client_id === ctx.clientId && appt.status === 'confirmed' && Date.parse(appt.starts_at) === Date.parse(reschedule.startsAt)) {
    return { state: 'idle', context: {}, actions: [confirmationAction('rescheduled', appt, ctx)] };
  }
  if (!isManageable(appt, ctx)) return showMenu(ctx, COPY.apptUnavailable);
  return {
    state: 'flow_reschedule',
    context: { ...snap.context, busySince: ctx.now.toISOString() },
    actions: [{ type: 'reschedule_booking', appointmentId: appt.id, startsAt: reschedule.startsAt, staffId: appt.staff_id }],
  };
}

function onBlocked(snap: Snapshot, ctx: EngineCtx): Out {
  const last = snap.context.blockedNoticeAt ? Date.parse(snap.context.blockedNoticeAt) : 0;
  if (ctx.now.getTime() - last < BLOCKED_NOTICE_MS) return unchanged(snap);
  return {
    state: 'idle',
    context: { blockedNoticeAt: ctx.now.toISOString() },
    actions: [send(text(COPY.blocked))],
  };
}

function onEscalated(snap: Snapshot): Out {
  if (snap.context.ackSent) return unchanged(snap);
  return {
    ...unchanged(snap),
    context: { ...snap.context, ackSent: true },
    actions: [send(text(COPY.escalatedAck))],
  };
}

function unchanged(snap: Snapshot): Out {
  return { state: snap.state, context: snap.context, actions: [], invalid: snap.invalidInputCount };
}

function invalid(snap: Snapshot, ctx: EngineCtx): Out {
  const strikes = snap.invalidInputCount + 1;
  if (strikes >= MAX_STRIKES) {
    return {
      state: 'escalated',
      context: { ackSent: true },
      actions: [{ type: 'escalate', reason: 'unrecognised_input' }, send(text(COPY.strikeEscalated))],
      invalid: strikes,
    };
  }
  return { ...enter(snap.state, snap.context, ctx, COPY.invalidPrefix), invalid: strikes };
}

// ---------------------------------------------------------------- booking results

function onBookingResult(snap: Snapshot, input: Extract<EngineInput, { kind: 'booking_result' }>, ctx: EngineCtx): Out {
  const c: ConvContext = { ...snap.context, busySince: undefined };
  if (input.ok) {
    const appt = input.appointment;
    if (input.op === 'create') {
      const actions: Action[] = [];
      if (c.attemptId) actions.push({ type: 'attempt_finish', attemptId: c.attemptId, outcome: 'completed', appointmentId: appt.id });
      actions.push(confirmationAction('created', appt, ctx));
      return { state: 'idle', context: {}, actions };
    }
    return { state: 'idle', context: {}, actions: [confirmationAction(input.op === 'reschedule' ? 'rescheduled' : 'cancelled', appt, ctx)] };
  }

  if (input.code === 'SLOT_UNAVAILABLE' && input.op !== 'cancel' && c.date) {
    return enterSlots(input.op === 'create' ? 'book' : 'resched', { ...c, startsAt: undefined, slotStaffId: undefined, page: 0 }, ctx, COPY.slotTaken);
  }
  if (input.code === 'CANCELLATION_WINDOW' && input.op !== 'create') return escalateWindow(ctx);
  if (input.code === 'SLOT_UNAVAILABLE' && input.op === 'reschedule' && snap.state === 'flow_reschedule') {
    // The Flow's time vanished between its SUMMARY and the move: keep the booking, reopen the Flow.
    return enter('flow_reschedule', c, ctx, COPY.slotTakenReschedFlow);
  }
  if (input.code === 'SLOT_UNAVAILABLE' && input.op === 'create' && snap.state === 'flow_booking') {
    // The Flow's time vanished between its SUMMARY and the booking: close the attempt, offer a fresh start.
    const menu = showMenu(ctx, COPY.slotTakenFlow);
    const finish: Action[] = c.attemptId ? [{ type: 'attempt_finish', attemptId: c.attemptId, outcome: 'failed', errorCode: 'SLOT_UNAVAILABLE' }] : [];
    return { ...menu, actions: [...finish, ...menu.actions] };
  }

  const actions: Action[] = [];
  if (c.attemptId) {
    actions.push({ type: 'attempt_finish', attemptId: c.attemptId, outcome: 'failed', errorCode: (input.detail ?? input.code).slice(0, 64) });
  }
  const menu = showMenu(ctx, COPY.bookingFailed);
  return { ...menu, actions: [...actions, ...menu.actions] };
}

/**
 * One confirmation per appointment change, whichever path sends it (engine,
 * Flow completion or NotificationService).
 */
export function confirmationDedupeKey(kind: 'created' | 'rescheduled' | 'cancelled', appt: Pick<AppointmentDTO, 'id' | 'starts_at'>): string {
  if (kind === 'created') return `confirm:${appt.id}:created`;
  if (kind === 'rescheduled') return `confirm:${appt.id}:rescheduled:${new Date(appt.starts_at).toISOString()}`;
  return `confirm:${appt.id}:cancelled`;
}

export function confirmationAction(kind: 'created' | 'rescheduled' | 'cancelled', appt: AppointmentDTO, ctx: EngineCtx): Action {
  const services = need(ctx, { kind: 'services' });
  const staff = need(ctx, { kind: 'staff', serviceId: appt.service_id });
  const summary = appointmentSummary(appt, services, staff, ctx);
  if (kind === 'cancelled') {
    return send(buttons(COPY.cancelled(summary), [{ id: rid.menu('book'), title: COPY.bookAgain }]), {
      dedupeKey: confirmationDedupeKey(kind, appt),
      critical: true,
      confirmation: { appointmentId: appt.id, kind },
    });
  }
  const body = kind === 'created' ? COPY.booked(summary) : COPY.rescheduled(summary);
  return send(buttons(body, [{ id: rid.appt('open', appt.id), title: COPY.manageBooking }]), {
    dedupeKey: confirmationDedupeKey(kind, appt),
    critical: true,
    confirmation: { appointmentId: appt.id, kind },
  });
}

// ---------------------------------------------------------------- step entry (render + guards)

/** Re-renders (or enters) a state from its context. Used for re-prompts too. */
function enter(state: ConvState, c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  switch (state) {
    case 'select_service':
      return enterServices(c, ctx, lead);
    case 'select_staff':
      return enterStaff(c, ctx, lead);
    case 'select_date':
      return enterDates('book', c, ctx, lead);
    case 'reschedule_select_date':
      return enterDates('resched', c, ctx, lead);
    case 'select_slot':
      return enterSlots('book', c, ctx, lead);
    case 'reschedule_select_slot':
      return enterSlots('resched', c, ctx, lead);
    case 'confirm':
      return enterConfirm('book', c, ctx, lead);
    case 'reschedule_confirm':
      return enterConfirm('resched', c, ctx, lead);
    case 'manage_booking':
      return enterBookings(c, ctx, lead);
    case 'manage_appointment':
      return enterAppointment(c, ctx, lead);
    case 'cancel_confirm':
      return enterCancelConfirm(c, ctx, lead);
    case 'flow_booking':
      if (c.attemptId && ctx.flows.booking) {
        return { state, context: c, actions: [send(flow('booking', withLead(lead, COPY.flowBookBody), COPY.flowBookCta, c.attemptId))] };
      }
      return showMenu(ctx, lead);
    case 'flow_reschedule':
      if (c.appointmentId && ctx.flows.reschedule) {
        return {
          state,
          context: c,
          actions: [send(flow('reschedule', withLead(lead, COPY.flowReschedBody), COPY.flowReschedCta, `rs-${c.appointmentId}`))],
        };
      }
      return showMenu(ctx, lead);
    default:
      return showMenu(ctx, lead);
  }
}

function enterServices(c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  const services = need(ctx, { kind: 'services' });
  if (services.length === 0) return showMenu(ctx, COPY.noServices);
  const page = validPage(services.length, c.page ?? 0) ? (c.page ?? 0) : 0;
  return {
    state: 'select_service',
    context: { attemptId: c.attemptId, page },
    actions: [
      send(
        pagedList({
          body: withLead(lead, COPY.chooseService),
          button: COPY.chooseServiceButton,
          rows: services.map((s) => serviceRow(s, ctx.business.currency)),
          page,
          more: { list: 'svcs', title: COPY.more },
          nav: ['menu'],
        }),
      ),
    ],
  };
}

function enterStaff(c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  if (!c.serviceId) return enterServices({ attemptId: c.attemptId }, ctx, lead);
  const staff = need(ctx, { kind: 'staff', serviceId: c.serviceId });
  if (staff.length === 0) return enterServices({ attemptId: c.attemptId }, ctx, COPY.noStaff);
  if (!(ctx.business.rules.allow_staff_selection && staff.length > 1)) {
    return enterDates('book', { attemptId: c.attemptId, serviceId: c.serviceId, staffId: null, staffStep: false, page: 0 }, ctx, lead);
  }
  const rows = [{ id: rid.stf(null), title: COPY.noPreference }, ...staff.map((s) => ({ id: rid.stf(s.id), title: s.name, description: s.title ?? undefined }))];
  const page = validPage(rows.length, c.page ?? 0) ? (c.page ?? 0) : 0;
  return {
    state: 'select_staff',
    context: { attemptId: c.attemptId, serviceId: c.serviceId, staffStep: true, page },
    actions: [
      send(pagedList({ body: withLead(lead, COPY.chooseStaff), button: COPY.chooseStaffButton, rows, page, more: { list: 'stfs', title: COPY.more }, nav: ['back', 'menu'] })),
    ],
  };
}

function enterDates(kind: 'book' | 'resched', c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  if (!c.serviceId) return showMenu(ctx, lead);
  const days = need(ctx, { kind: 'days', serviceId: c.serviceId, staffId: c.staffId ?? null });
  if (days.length === 0) {
    const out = showMenu(ctx, COPY.noDates);
    if (kind === 'book' && c.attemptId) {
      out.actions.unshift({ type: 'attempt_finish', attemptId: c.attemptId, outcome: 'failed', errorCode: 'NO_AVAILABILITY' });
    }
    return out;
  }
  const page = validPage(days.length, c.page ?? 0) ? (c.page ?? 0) : 0;
  const tz = ctx.business.timezone;
  return {
    state: kind === 'book' ? 'select_date' : 'reschedule_select_date',
    context: { ...c, date: undefined, startsAt: undefined, slotStaffId: undefined, page },
    actions: [
      send(
        pagedList({
          body: withLead(lead, COPY.chooseDate),
          button: COPY.chooseDateButton,
          rows: days.map((d) => ({ id: rid.day(d), title: shortDate(d, tz) })),
          page,
          more: { list: 'days', title: COPY.moreDates },
          nav: ['back', 'menu'],
        }),
      ),
    ],
  };
}

function onDay(kind: 'book' | 'resched', date: string, c: ConvContext, ctx: EngineCtx): Out | null {
  if (!c.serviceId) return null;
  const days = need(ctx, { kind: 'days', serviceId: c.serviceId, staffId: c.staffId ?? null });
  if (!days.includes(date)) return enterDates(kind, { ...c, page: 0 }, ctx, COPY.noSlots);
  return enterSlots(kind, { ...c, date, page: 0 }, ctx);
}

function enterSlots(kind: 'book' | 'resched', c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  if (!c.serviceId || !c.date) return enterDates(kind, { ...c, page: 0 }, ctx, lead);
  const slots = need(ctx, { kind: 'slots', serviceId: c.serviceId, staffId: c.staffId ?? null, date: c.date });
  if (slots.length === 0) return enterDates(kind, { ...c, date: undefined, page: 0 }, ctx, COPY.noSlots);
  const page = validPage(slots.length, c.page ?? 0) ? (c.page ?? 0) : 0;
  const tz = ctx.business.timezone;
  return {
    state: kind === 'book' ? 'select_slot' : 'reschedule_select_slot',
    context: { ...c, startsAt: undefined, slotStaffId: undefined, page },
    actions: [
      send(
        pagedList({
          body: withLead(lead, COPY.chooseSlot(shortDate(c.date, tz))),
          button: COPY.chooseSlotButton,
          rows: slots.map((s) => ({ id: rid.slot(s.starts_at, c.staffId ?? null), title: timeOf(s.starts_at, tz) })),
          page,
          more: { list: 'slots', title: COPY.moreTimes },
          nav: ['back', 'menu'],
        }),
      ),
    ],
  };
}

function onSlot(kind: 'book' | 'resched', id: Extract<ReplyId, { t: 'slot' }>, c: ConvContext, ctx: EngineCtx): Out | null {
  if (!c.serviceId || !c.date) return null;
  if ((c.staffId ?? null) !== id.staffId) return null;
  if (dateOf(id.startsAt, ctx.business.timezone) !== c.date) return null;
  const slots = need(ctx, { kind: 'slots', serviceId: c.serviceId, staffId: c.staffId ?? null, date: c.date });
  const at = Date.parse(id.startsAt);
  const slot = slots.find((s) => Date.parse(s.starts_at) === at && (id.staffId === null || s.staff_ids.includes(id.staffId)));
  if (!slot) return enterSlots(kind, { ...c, page: 0 }, ctx, COPY.slotTaken);
  return enterConfirm(kind, { ...c, startsAt: slot.starts_at, slotStaffId: id.staffId }, ctx);
}

function enterConfirm(kind: 'book' | 'resched', c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  if (!c.serviceId || !c.startsAt) return enterSlots(kind, c, ctx, lead);
  const services = need(ctx, { kind: 'services' });
  const staff = need(ctx, { kind: 'staff', serviceId: c.serviceId });
  const svc = services.find((s) => s.id === c.serviceId);
  const summary = summaryLines(
    {
      service: serviceName(services, c.serviceId),
      startsAt: c.startsAt,
      staff: staffName(staff, c.slotStaffId ?? c.staffId) ?? COPY.anyStaff,
      price: kind === 'book' && svc && svc.price_cents > 0 ? money(svc.price_cents, ctx.business.currency) : null,
    },
    ctx.business.timezone,
  );
  const title = kind === 'book' ? COPY.confirmTitle : COPY.reschedConfirmTitle;
  return {
    state: kind === 'book' ? 'confirm' : 'reschedule_confirm',
    context: c,
    actions: [
      send(
        buttons(withLead(lead, `${title}\n\n${summary}`), [
          { id: rid.cfm(true), title: COPY.confirmYes },
          { id: rid.cfm(false), title: COPY.confirmNo },
          { id: rid.nav('back'), title: COPY.back },
        ]),
      ),
    ],
  };
}

function enterBookings(c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  const upcoming = need(ctx, { kind: 'upcoming' });
  if (upcoming.length === 0) return showMenu(ctx, COPY.noUpcoming);
  const services = need(ctx, { kind: 'services' });
  const tz = ctx.business.timezone;
  const rows = upcoming.map((a) => {
    const staff = need(ctx, { kind: 'staff', serviceId: a.service_id });
    const who = staffName(staff, a.staff_id);
    return {
      id: rid.appt('open', a.id),
      title: `${shortDate(dateOf(a.starts_at, tz), tz)} ${timeOf(a.starts_at, tz)}`,
      description: [serviceName(services, a.service_id), who].filter(Boolean).join(' · '),
    };
  });
  const page = validPage(rows.length, c.page ?? 0) ? (c.page ?? 0) : 0;
  return {
    state: 'manage_booking',
    context: { page },
    actions: [
      send(pagedList({ body: withLead(lead, COPY.chooseBooking), button: COPY.chooseBookingButton, rows, page, more: { list: 'appts', title: COPY.moreBookings }, nav: ['menu'] })),
    ],
  };
}

function enterAppointment(c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  if (!c.appointmentId) return enterBookings({}, ctx, lead);
  const appt = need(ctx, { kind: 'appointment', id: c.appointmentId });
  if (!isManageable(appt, ctx)) return showMenu(ctx, COPY.apptUnavailable);
  const summary = appointmentSummary(appt, need(ctx, { kind: 'services' }), need(ctx, { kind: 'staff', serviceId: appt.service_id }), ctx);
  return {
    state: 'manage_appointment',
    context: { appointmentId: appt.id },
    actions: [
      send(
        buttons(withLead(lead, COPY.apptActions(summary)), [
          { id: rid.appt('resched', appt.id), title: COPY.reschedule },
          { id: rid.appt('cancel', appt.id), title: COPY.cancel },
          { id: rid.nav('back'), title: COPY.back },
        ]),
      ),
    ],
  };
}

function enterCancelConfirm(c: ConvContext, ctx: EngineCtx, lead?: string): Out {
  if (!c.appointmentId) return enterBookings({}, ctx, lead);
  const appt = need(ctx, { kind: 'appointment', id: c.appointmentId });
  if (!isManageable(appt, ctx)) return showMenu(ctx, COPY.apptUnavailable);
  const summary = appointmentSummary(appt, need(ctx, { kind: 'services' }), need(ctx, { kind: 'staff', serviceId: appt.service_id }), ctx);
  return {
    state: 'cancel_confirm',
    context: { appointmentId: appt.id },
    actions: [
      send(
        buttons(withLead(lead, COPY.cancelConfirm(summary)), [
          { id: rid.cfm(true), title: COPY.cancelYes },
          { id: rid.cfm(false), title: COPY.cancelNo },
          { id: rid.nav('back'), title: COPY.back },
        ]),
      ),
    ],
  };
}

function onMore(list: MoreList, page: number, snap: Snapshot, ctx: EngineCtx): Out | null {
  const c = { ...snap.context, page };
  const expected: Record<MoreList, ConvState[]> = {
    svcs: ['select_service'],
    stfs: ['select_staff'],
    days: ['select_date', 'reschedule_select_date'],
    slots: ['select_slot', 'reschedule_select_slot'],
    appts: ['manage_booking'],
  };
  if (!expected[list].includes(snap.state)) return null;
  const total = (() => {
    switch (list) {
      case 'svcs':
        return need(ctx, { kind: 'services' }).length;
      case 'stfs':
        return c.serviceId ? need(ctx, { kind: 'staff', serviceId: c.serviceId }).length + 1 : 0;
      case 'days':
        return c.serviceId ? need(ctx, { kind: 'days', serviceId: c.serviceId, staffId: c.staffId ?? null }).length : 0;
      case 'slots':
        return c.serviceId && c.date ? need(ctx, { kind: 'slots', serviceId: c.serviceId, staffId: c.staffId ?? null, date: c.date }).length : 0;
      case 'appts':
        return need(ctx, { kind: 'upcoming' }).length;
    }
  })();
  if (page === 0 || !validPage(total, page)) return null;
  return enter(snap.state, c, ctx);
}

// ---------------------------------------------------------------- finalize

function finalize(snap: Snapshot, out: Out, ctx: EngineCtx) {
  const actions = [...out.actions];
  const oldAttempt = snap.context.attemptId;
  const newAttempt = out.context.attemptId;
  const finishes = actions.filter((a): a is Extract<Action, { type: 'attempt_finish' }> => a.type === 'attempt_finish');

  // Leaving an attempt without finishing it explicitly = abandoned.
  if (oldAttempt && oldAttempt !== newAttempt && !finishes.some((f) => f.attemptId === oldAttempt)) {
    const abandon: Extract<Action, { type: 'attempt_finish' }> = { type: 'attempt_finish', attemptId: oldAttempt, outcome: 'abandoned' };
    actions.unshift(abandon);
    finishes.push(abandon);
  }

  // One step per transition while an attempt is active (FR21 instrumentation).
  const at = ctx.now.toISOString();
  const changed = out.state !== snap.state || out.actions.length > 0;
  if (newAttempt && changed) {
    const startIdx = actions.findIndex((a) => a.type === 'attempt_start' && a.attemptId === newAttempt);
    actions.splice(startIdx + 1, 0, { type: 'attempt_step', attemptId: newAttempt, step: out.state, at });
  }
  for (const f of finishes) {
    const idx = actions.indexOf(f);
    actions.splice(idx, 0, { type: 'attempt_step', attemptId: f.attemptId, step: f.outcome, at });
  }

  return {
    state: out.state,
    context: stripUndefined(out.context),
    invalidInputCount: out.invalid ?? 0,
    actions,
  };
}

function stripUndefined(c: ConvContext): ConvContext {
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as ConvContext;
}
