/**
 * In-memory fakes for WhatsApp tests: repository, Graph client, BookingService
 * and a deps builder. No network, no database.
 */
import { randomUUID } from 'node:crypto';

import type {
  AppointmentDTO,
  BookingRules,
  BusinessDTO,
  ServiceDTO,
  SlotDTO,
  StaffDTO,
} from '../../../../packages/shared/api.ts';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { encryptSecret } from '../../src/lib/crypto.ts';
import type { Db } from '../../src/lib/db.ts';
import { AppError, ruleViolation } from '../../src/lib/errors.ts';
import type { Logger } from '../../src/lib/logger.ts';
import type { ClerkClaims } from '../../src/middleware/auth.ts';
import type { BookingService } from '../../src/ports.ts';
import type { WaContainer, WaDeps } from '../../src/whatsapp/deps.ts';
import type { FlowSummary, GraphClient, TemplateSummary } from '../../src/whatsapp/graph.ts';
import {
  isoUtc,
  MAX_WEBHOOK_ATTEMPTS,
  shouldAdvance,
  type AppointmentBrief,
  type ClientRow,
  type ConversationRow,
  type EscalationRow,
  type MessageInsert,
  type MessageRow,
  type ReminderClaim,
  type TemplateRow,
  type WaAccountRow,
  type WaRepo,
} from '../../src/whatsapp/repo.ts';
import { signMetaBody } from '../../src/whatsapp/signature.ts';
import { memoryIdempotencyStore, TEST_ENV, testContainer } from '../helpers.ts';

// ---------------------------------------------------------------- fixed ids

export const BIZ = '00000000-0000-4000-8000-000000000b12';
export const ACCOUNT_ID = '00000000-0000-4000-8000-0000000000a1';
export const PHONE_NUMBER_ID = '111222333';
export const WABA_ID = '999888777';
export const SVC_CUT = '00000000-0000-4000-8000-00000000c001';
export const SVC_COLOUR = '00000000-0000-4000-8000-00000000c002';
export const STAFF_SAM = '00000000-0000-4000-8000-00000000d001';
export const STAFF_ALEX = '00000000-0000-4000-8000-00000000d002';
export const CUSTOMER_PHONE = '+27821234567';
export const CUSTOMER_WA = '27821234567';

export const NOW = new Date('2026-09-28T08:00:00.000Z'); // Mon 10:00 in Johannesburg

export const RULES: BookingRules = {
  lead_time_minutes: 60,
  cancellation_window_minutes: 1440,
  buffer_minutes: 0,
  slot_interval_minutes: 15,
  booking_horizon_days: 60,
  reminder_offsets_minutes: [1440, 120],
  allow_staff_selection: true,
};

export function service(id: string, name: string, extra: Partial<ServiceDTO> = {}): ServiceDTO {
  return {
    id,
    name,
    description: null,
    category: null,
    duration_minutes: 60,
    price_cents: 25000,
    deposit_cents: 0,
    is_active: true,
    sort_order: 0,
    ...extra,
  };
}

export function staff(id: string, name: string): StaffDTO {
  return {
    id,
    user_id: null,
    name,
    title: null,
    photo_url: null,
    phone: null,
    email: null,
    color: null,
    is_active: true,
    accepts_bookings: true,
    sort_order: 0,
  };
}

export const uuidN = (n: number, prefix = 'e') => `00000000-0000-4000-8000-${prefix}${String(n).padStart(11, '0')}`;

// ---------------------------------------------------------------- world + fake booking

export interface World {
  business: BusinessDTO;
  services: ServiceDTO[];
  staff: StaffDTO[];
  /** service id → staff ids */
  staffServices: Record<string, string[]>;
  days: string[];
  /** date → slots */
  slots: Record<string, SlotDTO[]>;
  appointments: AppointmentDTO[];
  /** starts_at values that throw SLOT_UNAVAILABLE on create/reschedule */
  taken: Set<string>;
  calls: { method: string; args: unknown }[];
}

export function slot(startsAt: string, staffIds: string[] = [STAFF_SAM, STAFF_ALEX]): SlotDTO {
  return { starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + 3600_000).toISOString(), staff_ids: staffIds };
}

export function makeWorld(over: Partial<World> = {}): World {
  return {
    business: {
      id: BIZ,
      name: 'Nadia Hair',
      slug: 'nadia-hair',
      timezone: 'Africa/Johannesburg',
      currency: 'ZAR',
      logo_url: null,
      address: null,
      phone: null,
      email: null,
      booking_rules: { ...RULES },
    },
    services: [service(SVC_CUT, 'Haircut'), service(SVC_COLOUR, 'Colour', { price_cents: 0, duration_minutes: 90 })],
    staff: [staff(STAFF_SAM, 'Sam'), staff(STAFF_ALEX, 'Alex')],
    staffServices: { [SVC_CUT]: [STAFF_SAM, STAFF_ALEX], [SVC_COLOUR]: [STAFF_SAM] },
    days: ['2026-09-29', '2026-09-30', '2026-10-01'],
    slots: {
      '2026-09-29': [slot('2026-09-29T07:00:00.000Z'), slot('2026-09-29T08:00:00.000Z', [STAFF_SAM])],
      '2026-09-30': [slot('2026-09-30T07:00:00.000Z')],
      '2026-10-01': [slot('2026-10-01T07:00:00.000Z')],
    },
    appointments: [],
    taken: new Set(),
    calls: [],
    ...over,
  };
}

export function appointment(over: Partial<AppointmentDTO> & { id: string; client_id: string; starts_at: string }): AppointmentDTO {
  return {
    business_id: BIZ,
    staff_id: STAFF_SAM,
    service_id: SVC_CUT,
    ends_at: new Date(Date.parse(over.starts_at) + 3600_000).toISOString(),
    status: 'confirmed',
    source: 'whatsapp',
    price_cents: 25000,
    duration_minutes: 60,
    notes: null,
    checked_in_at: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: NOW.toISOString(),
    ...over,
  };
}

export function fakeBooking(world: World): BookingService {
  const log = (method: string, args: unknown) => world.calls.push({ method, args });
  const windowCheck = (appt: AppointmentDTO, actorType: string, now: Date) => {
    if (actorType !== 'customer') return;
    const mins = (Date.parse(appt.starts_at) - now.getTime()) / 60_000;
    if (mins < world.business.booking_rules.cancellation_window_minutes) {
      throw ruleViolation('CANCELLATION_WINDOW', 'Too late to change');
    }
  };
  return {
    async getBusiness() {
      return world.business;
    },
    async listServices() {
      return world.services.filter((s) => s.is_active);
    },
    async listBookableStaff(_b, serviceId) {
      const ids = world.staffServices[serviceId] ?? [];
      return world.staff.filter((s) => ids.includes(s.id));
    },
    async listAvailableDays(q) {
      log('listAvailableDays', q);
      return world.days.filter((d) => d >= q.from && d <= q.to);
    },
    async listAvailableSlots(q) {
      log('listAvailableSlots', q);
      const slots = (world.slots[q.date] ?? []).filter((s) => !q.staffId || s.staff_ids.includes(q.staffId));
      return { date: q.date, timezone: world.business.timezone, slots };
    },
    async createAppointment(input) {
      log('createAppointment', input);
      const existing = world.appointments.find((a) => (a as AppointmentDTO & { key?: string }).key === input.idempotencyKey);
      if (existing) return existing;
      if (world.taken.has(input.startsAt)) throw new AppError('SLOT_UNAVAILABLE', 'taken');
      const slotStaff = world.slots[input.startsAt.slice(0, 10)]?.find((s) => s.starts_at === input.startsAt)?.staff_ids[0];
      const appt = appointment({
        id: randomUUID(),
        client_id: input.clientId,
        service_id: input.serviceId,
        staff_id: input.staffId ?? slotStaff ?? STAFF_SAM,
        starts_at: input.startsAt,
      });
      world.appointments.push(Object.assign(appt, { key: input.idempotencyKey }));
      return appt;
    },
    async rescheduleAppointment(input) {
      log('rescheduleAppointment', input);
      const appt = world.appointments.find((a) => a.id === input.appointmentId);
      if (!appt) throw new AppError('NOT_FOUND', 'nope');
      windowCheck(appt, input.actor.type, input.now ?? new Date());
      if (world.taken.has(input.startsAt)) throw new AppError('SLOT_UNAVAILABLE', 'taken');
      appt.starts_at = input.startsAt;
      appt.ends_at = new Date(Date.parse(input.startsAt) + 3600_000).toISOString();
      if (input.staffId) appt.staff_id = input.staffId;
      return { ...appt };
    },
    async cancelAppointment(input) {
      log('cancelAppointment', input);
      const appt = world.appointments.find((a) => a.id === input.appointmentId);
      if (!appt) throw new AppError('NOT_FOUND', 'nope');
      windowCheck(appt, input.actor.type, input.now ?? new Date());
      appt.status = 'cancelled';
      return { ...appt };
    },
    async getAppointment(_b, id) {
      const a = world.appointments.find((x) => x.id === id);
      return a ? { ...a } : null;
    },
    async listUpcomingForClient(_b, clientId, now) {
      return world.appointments
        .filter((a) => a.client_id === clientId && a.status === 'confirmed' && Date.parse(a.starts_at) > (now ?? new Date()).getTime())
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    },
  };
}

// ---------------------------------------------------------------- memory repo

export interface MemoryDb {
  accounts: WaAccountRow[];
  templates: (TemplateRow & { business_id: string })[];
  webhookEvents: {
    id: string;
    event_key: string;
    whatsapp_account_id: string | null;
    payload: unknown;
    processed_at: string | null;
    error: string | null;
    attempts: number;
  }[];
  clients: ClientRow[];
  conversations: ConversationRow[];
  messages: (MessageInsert & { id: string; delivered_at?: string; read_at?: string })[];
  escalations: EscalationRow[];
  attempts: {
    id: string;
    business_id: string;
    client_id: string;
    conversation_id: string;
    channel: 'whatsapp';
    outcome: string;
    steps: { step: string; at: string }[];
    step_count: number;
    appointment_id: string | null;
    error_code: string | null;
  }[];
  appointmentEvents: { appointment_id: string; type: string; payload: Record<string, unknown> }[];
  reminderQueue: ReminderClaim[];
  pushTokens: { business_id: string; token: string }[];
  businesses: { id: string; name: string; timezone: string }[];
  appointments: () => AppointmentDTO[];
  names: { services: Record<string, string>; staff: Record<string, string> };
  /** Set to force the next saveConversation to conflict */
  conflictOnce?: boolean;
}

export function memoryRepo(world?: World): WaRepo & { db: MemoryDb } {
  const db: MemoryDb = {
    accounts: [],
    templates: [],
    webhookEvents: [],
    clients: [],
    conversations: [],
    messages: [],
    escalations: [],
    attempts: [],
    appointmentEvents: [],
    reminderQueue: [],
    pushTokens: [],
    businesses: [{ id: BIZ, name: 'Nadia Hair', timezone: 'Africa/Johannesburg' }],
    appointments: () => world?.appointments ?? [],
    names: {
      services: Object.fromEntries((world?.services ?? []).map((s) => [s.id, s.name])),
      staff: Object.fromEntries((world?.staff ?? []).map((s) => [s.id, s.name])),
    },
  };
  const clone = <T>(v: T): T => structuredClone(v);

  const repo: WaRepo = {
    async getAccountByPhoneNumberId(id) {
      return clone(db.accounts.find((a) => a.phone_number_id === id) ?? null);
    },
    async getAccountsByWabaId(id) {
      return clone(db.accounts.filter((a) => a.waba_id === id));
    },
    async getAccountByBusiness(id) {
      return clone(db.accounts.find((a) => a.business_id === id) ?? null);
    },
    async listAccounts(f) {
      return clone(
        db.accounts.filter(
          (a) =>
            (!f.statuses || f.statuses.includes(a.status)) &&
            (!f.tokenExpiresBefore || (a.token_expires_at !== null && a.token_expires_at < f.tokenExpiresBefore)),
        ),
      );
    },
    async upsertAccount(businessId, patch) {
      let a = db.accounts.find((x) => x.business_id === businessId);
      if (!a) {
        a = {
          id: randomUUID(),
          business_id: businessId,
          waba_id: patch.waba_id,
          phone_number_id: patch.phone_number_id,
          display_phone: null,
          verified_name: null,
          access_token_ciphertext: null,
          token_expires_at: null,
          flow_ids: {},
          status: 'pending',
          quality_rating: null,
          messaging_limit: null,
          last_health_check_at: null,
          last_error: null,
        };
        db.accounts.push(a);
      }
      Object.assign(a, patch);
      return clone(a);
    },
    async updateAccount(id, patch) {
      const a = db.accounts.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    },
    async listTemplates(accountId) {
      return clone(db.templates.filter((t) => t.whatsapp_account_id === accountId));
    },
    async upsertTemplate(row) {
      const t = db.templates.find((x) => x.whatsapp_account_id === row.whatsapp_account_id && x.name === row.name && x.language === row.language);
      if (t) Object.assign(t, row);
      else db.templates.push({ id: randomUUID(), ...row } as TemplateRow & { business_id: string });
    },
    async updateTemplateStatus(accountId, match, patch) {
      const rows = db.templates.filter(
        (t) =>
          t.whatsapp_account_id === accountId &&
          (match.metaTemplateId ? t.meta_template_id === match.metaTemplateId : t.name === match.name && (!match.language || t.language === match.language)),
      );
      rows.forEach((t) => Object.assign(t, patch));
      return rows.length;
    },
    async recordWebhookEvent(e) {
      const existing = db.webhookEvents.find((x) => x.event_key === e.eventKey);
      if (existing) {
        if (existing.processed_at || existing.attempts >= MAX_WEBHOOK_ATTEMPTS) return null;
        existing.attempts += 1;
        return { id: existing.id, attempts: existing.attempts };
      }
      const id = randomUUID();
      db.webhookEvents.push({
        id,
        event_key: e.eventKey,
        whatsapp_account_id: e.accountId,
        payload: structuredClone(e.payload),
        processed_at: null,
        error: null,
        attempts: 1,
      });
      return { id, attempts: 1 };
    },
    async finishWebhookEvent(id, error, at) {
      const e = db.webhookEvents.find((x) => x.id === id);
      if (e) Object.assign(e, { processed_at: at, error });
    },
    async upsertClientByPhone(businessId, phone, name) {
      let c = db.clients.find((x) => x.business_id === businessId && x.phone_e164 === phone);
      if (!c) {
        c = { id: randomUUID(), business_id: businessId, phone_e164: phone, name: null, email: null, is_blocked: false, whatsapp_opt_in: true };
        db.clients.push(c);
      }
      if (!c.name && name) c.name = name;
      return clone(c);
    },
    async getClient(businessId, id) {
      return clone(db.clients.find((c) => c.business_id === businessId && c.id === id) ?? null);
    },
    async updateClientDetails(businessId, id, patch) {
      const c = db.clients.find((x) => x.business_id === businessId && x.id === id);
      if (c && patch.name && !c.name) c.name = patch.name;
      if (c && patch.email && !c.email) c.email = patch.email;
    },
    async getOrCreateConversation(businessId, clientId) {
      let c = db.conversations.find((x) => x.business_id === businessId && x.client_id === clientId);
      if (!c) {
        c = {
          id: randomUUID(),
          business_id: businessId,
          client_id: clientId,
          state: 'idle',
          context: {},
          version: 0,
          invalid_input_count: 0,
          window_expires_at: null,
          last_inbound_at: null,
          last_message_at: null,
        };
        db.conversations.push(c);
      }
      return clone(c);
    },
    async getConversation(id, businessId) {
      return clone(db.conversations.find((c) => c.id === id && (!businessId || c.business_id === businessId)) ?? null);
    },
    async saveConversation(id, expected, patch) {
      const c = db.conversations.find((x) => x.id === id);
      if (db.conflictOnce && c) {
        db.conflictOnce = false;
        c.version += 1; // someone else wrote meanwhile
        return null;
      }
      if (!c || c.version !== expected) return null;
      Object.assign(c, clone(patch), { version: expected + 1 });
      return clone(c);
    },
    async listExpiredConversations(now, limit) {
      return clone(
        db.conversations
          .filter((c) => c.window_expires_at && c.window_expires_at < now && !['idle', 'closed', 'escalated'].includes(c.state))
          .slice(0, limit),
      );
    },
    async insertMessage(row) {
      if (row.wa_message_id && db.messages.some((m) => m.wa_message_id === row.wa_message_id)) return null;
      const id = randomUUID();
      db.messages.push({ ...clone(row), id });
      return { id };
    },
    async updateMessage(id, patch) {
      const m = db.messages.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
    },
    async hasMessageWithDedupeKey(conversationId, key) {
      return db.messages.some((m) => m.conversation_id === conversationId && m.body.dedupe_key === key);
    },
    async updateMessageStatusByWamid(wamid, patch) {
      const m = db.messages.find((x) => x.wa_message_id === wamid);
      if (!m) return null;
      if (shouldAdvance(m.status, patch.status)) m.status = patch.status;
      if (patch.status === 'delivered') m.delivered_at = patch.at;
      if (patch.status === 'read') m.read_at = patch.at;
      if (patch.error) m.error = patch.error;
      return clone(m) as unknown as MessageRow;
    },
    async openEscalation(e) {
      const open = db.escalations.find((x) => x.conversation_id === e.conversationId && x.status === 'open');
      if (open) return { id: open.id, created: false };
      const id = randomUUID();
      db.escalations.push({
        id,
        business_id: e.businessId,
        conversation_id: e.conversationId,
        client_id: e.clientId,
        reason: e.reason,
        status: 'open',
        note: e.note ?? null,
        resolved_at: null,
        resolved_by: null,
      });
      return { id, created: true };
    },
    async resolveOpenEscalations(businessId, conversationId, userId, at) {
      const rows = db.escalations.filter((x) => x.business_id === businessId && x.conversation_id === conversationId && x.status === 'open');
      rows.forEach((r) => Object.assign(r, { status: 'resolved', resolved_by: userId, resolved_at: at }));
      return rows.length;
    },
    async resolveEscalation(businessId, id, userId, note, at) {
      const r = db.escalations.find((x) => x.business_id === businessId && x.id === id);
      if (!r) return null;
      if (r.status === 'open') Object.assign(r, { status: 'resolved', resolved_by: userId, resolved_at: at, ...(note ? { note } : {}) });
      return clone(r);
    },
    async startAttempt(a) {
      if (db.attempts.some((x) => x.id === a.id)) return;
      db.attempts.push({
        id: a.id,
        business_id: a.businessId,
        client_id: a.clientId,
        conversation_id: a.conversationId,
        channel: 'whatsapp',
        outcome: 'in_progress',
        steps: [],
        step_count: 0,
        appointment_id: null,
        error_code: null,
      });
    },
    async appendAttemptStep(id, step, at) {
      const a = db.attempts.find((x) => x.id === id);
      if (!a) return;
      a.steps.push({ step, at });
      a.step_count += 1;
    },
    async finishAttempt(id, outcome, extra) {
      const a = db.attempts.find((x) => x.id === id);
      if (!a || a.outcome !== 'in_progress') return;
      a.outcome = outcome;
      a.appointment_id = extra.appointmentId ?? a.appointment_id;
      a.error_code = extra.errorCode ?? a.error_code;
    },
    async abandonAttemptsForConversation(conversationId) {
      const rows = db.attempts.filter((a) => a.conversation_id === conversationId && a.outcome === 'in_progress');
      rows.forEach((a) => (a.outcome = 'abandoned'));
      return rows.length;
    },
    async getAppointmentBrief(businessId, id): Promise<AppointmentBrief | null> {
      const a = db.appointments().find((x) => x.id === id && x.business_id === businessId);
      if (!a) return null;
      return {
        id: a.id,
        business_id: a.business_id,
        client_id: a.client_id,
        service_id: a.service_id,
        staff_id: a.staff_id,
        status: a.status,
        starts_at: a.starts_at,
        service_name: db.names.services[a.service_id] ?? null,
        staff_name: db.names.staff[a.staff_id] ?? null,
      };
    },
    async insertAppointmentEvent(e) {
      db.appointmentEvents.push({ appointment_id: e.appointmentId, type: e.type, payload: e.payload });
    },
    async claimDueReminders(_now, limit) {
      const out = db.reminderQueue.splice(0, limit);
      out.forEach((r) =>
        db.appointmentEvents.push({
          appointment_id: r.appointment_id,
          type: 'reminder_sent',
          payload: { offset_minutes: r.offset_minutes, starts_at: isoUtc(r.starts_at), state: 'claimed' },
        }),
      );
      return clone(out);
    },
    async setReminderState(claim, extra) {
      const startsAt = isoUtc(claim.starts_at);
      const e = db.appointmentEvents.find(
        (x) =>
          x.appointment_id === claim.appointment_id &&
          x.type === 'reminder_sent' &&
          x.payload.offset_minutes === claim.offset_minutes &&
          x.payload.starts_at === startsAt,
      );
      if (e) e.payload = { ...extra, offset_minutes: claim.offset_minutes, starts_at: startsAt };
    },
    async getBusinessBrief(id) {
      return clone(db.businesses.find((b) => b.id === id) ?? null);
    },
    async listPushTokens(businessId) {
      return db.pushTokens.filter((t) => t.business_id === businessId).map((t) => t.token);
    },
  };
  return Object.assign(repo, { db });
}

// ---------------------------------------------------------------- fake graph

export interface GraphCall {
  method: keyof GraphClient;
  args: unknown[];
  token: string;
}

export interface FakeGraph {
  calls: GraphCall[];
  sent: { phoneNumberId: string; payload: Record<string, unknown> }[];
  /** Make the next N sendMessage calls throw this */
  failNext: (err: Error, times?: number) => void;
  factory: (token: string) => GraphClient;
  flows: FlowSummary[];
  templates: TemplateSummary[];
  debugExpiresAt: Date | null;
}

export function fakeGraph(): FakeGraph {
  let seq = 0;
  let failure: { err: Error; times: number } | null = null;
  const state: FakeGraph = {
    calls: [],
    sent: [],
    flows: [],
    templates: [],
    debugExpiresAt: null,
    failNext: (err, times = 1) => {
      failure = { err, times };
    },
    factory: (token) => {
      const rec = (method: keyof GraphClient, ...args: unknown[]) => state.calls.push({ method, args, token });
      return {
        async sendMessage(phoneNumberId, payload) {
          rec('sendMessage', phoneNumberId, payload);
          if (failure && failure.times > 0) {
            failure.times -= 1;
            throw failure.err;
          }
          state.sent.push({ phoneNumberId, payload });
          seq += 1;
          return { wamid: `wamid.out.${seq}` };
        },
        async markAsRead(...a) {
          rec('markAsRead', ...a);
        },
        async getPhoneNumber(id) {
          rec('getPhoneNumber', id);
          return { id, display_phone_number: '+27 82 000 0000', verified_name: 'Nadia Hair', quality_rating: 'GREEN', messaging_limit_tier: 'TIER_1K' };
        },
        async subscribeApp(...a) {
          rec('subscribeApp', ...a);
        },
        async unsubscribeApp(...a) {
          rec('unsubscribeApp', ...a);
        },
        async registerNumber(...a) {
          rec('registerNumber', ...a);
        },
        async uploadFlowPublicKey(...a) {
          rec('uploadFlowPublicKey', ...a);
        },
        async listFlows(...a) {
          rec('listFlows', ...a);
          return structuredClone(state.flows);
        },
        async createFlow(wabaId, input) {
          rec('createFlow', wabaId, input);
          const id = `flow-${input.name}`;
          state.flows.push({ id, name: input.name, status: input.publish ? 'PUBLISHED' : 'DRAFT' });
          return { id, validationErrors: [] };
        },
        async updateFlowJson(...a) {
          rec('updateFlowJson', ...a);
          return { validationErrors: [] };
        },
        async updateFlowMetadata(...a) {
          rec('updateFlowMetadata', ...a);
        },
        async publishFlow(id) {
          rec('publishFlow', id);
          const f = state.flows.find((x) => x.id === id);
          if (f) f.status = 'PUBLISHED';
        },
        async listTemplates(...a) {
          rec('listTemplates', ...a);
          return structuredClone(state.templates);
        },
        async createTemplate(wabaId, t) {
          rec('createTemplate', wabaId, t);
          const id = `tpl-${String(t.name)}`;
          state.templates.push({ id, name: String(t.name), language: String(t.language), status: 'PENDING', category: 'UTILITY' });
          return { id, status: 'PENDING' };
        },
        async exchangeCode(...a) {
          rec('exchangeCode', ...a);
          return { accessToken: 'EAAG-business-token' };
        },
        async debugToken(...a) {
          rec('debugToken', ...a);
          return { isValid: true, expiresAt: state.debugExpiresAt, scopes: [] };
        },
        async exchangeLongLived(...a) {
          rec('exchangeLongLived', ...a);
          return { accessToken: 'EAAG-long-lived', expiresIn: 60 * 24 * 3600 };
        },
      };
    },
  };
  return state;
}

// ---------------------------------------------------------------- deps

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};

export function liveAccount(over: Partial<WaAccountRow> = {}): WaAccountRow {
  return {
    id: ACCOUNT_ID,
    business_id: BIZ,
    waba_id: WABA_ID,
    phone_number_id: PHONE_NUMBER_ID,
    display_phone: '+27 82 000 0000',
    verified_name: 'Nadia Hair',
    access_token_ciphertext: encryptSecret('EAAG-test-token', TEST_ENV.TOKEN_ENCRYPTION_KEY!),
    token_expires_at: null,
    flow_ids: {},
    status: 'live',
    quality_rating: 'GREEN',
    messaging_limit: 'TIER_1K',
    last_health_check_at: null,
    last_error: null,
    ...over,
  };
}

export interface Harness {
  world: World;
  repo: ReturnType<typeof memoryRepo>;
  graph: FakeGraph;
  booking: BookingService;
  deps: WaDeps;
  pushes: { businessId: string; title: string; body: string }[];
  clock: { now: Date };
}

export function harness(opts: { world?: World; account?: Partial<WaAccountRow> | null } = {}): Harness {
  const world = opts.world ?? makeWorld();
  const repo = memoryRepo(world);
  if (opts.account !== null) repo.db.accounts.push(liveAccount(opts.account ?? {}));
  const graph = fakeGraph();
  const booking = fakeBooking(world);
  const pushes: Harness['pushes'] = [];
  const clock = { now: new Date(NOW) };
  let idSeq = 0;
  const deps: WaDeps = {
    env: { ...TEST_ENV, META_APP_ID: 'app-id', WHATSAPP_REGISTRATION_PIN: '123456' },
    repo,
    booking,
    graph: graph.factory,
    push: {
      async toBusiness(businessId, m) {
        pushes.push({ businessId, title: m.title, body: m.body });
        return 1;
      },
    },
    now: () => new Date(clock.now),
    newId: () => uuidN(++idSeq, 'f'),
    logger: silentLogger,
  };
  return { world, repo, graph, booking, deps, pushes, clock };
}

// ---------------------------------------------------------------- app harness (routes)

export const ORG = 'org_wa_test';

const CLAIMS: Record<string, ClerkClaims> = {
  owner: { sub: 'user_owner', org_id: ORG, org_role: 'org:admin' },
  staff: { sub: 'user_staff', org_id: ORG, org_role: 'org:member' },
};

/** Minimal Db for requireAuth's businesses lookup (org → business id). */
function authDb(businessId: string): Db {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { id: businessId }, error: null }) };
  return { from: () => chain } as unknown as Db;
}

export interface CallOptions {
  token?: 'owner' | 'staff' | null;
  body?: unknown;
  key?: string | null;
  headers?: Record<string, string>;
  raw?: string;
}

export interface AppHarness extends Harness {
  app: ReturnType<typeof createApp>;
  container: WaContainer;
  call(method: string, path: string, opts?: CallOptions): Promise<{ status: number; body: any; text: string }>;
  /** POSTs a signed webhook payload */
  webhook(payload: unknown, signature?: string): Promise<{ status: number; body: any }>;
}

let keySeq = 0;

export function appHarness(opts: { world?: World; account?: Partial<WaAccountRow> | null; env?: Partial<Env> & Record<string, string | undefined> } = {}): AppHarness {
  const h = harness(opts);
  if (opts.env) h.deps.env = { ...h.deps.env, ...opts.env };
  const container: WaContainer = {
    ...testContainer({ booking: h.booking, db: authDb(BIZ), env: h.deps.env }),
    whatsapp: h.deps,
  };
  const store = memoryIdempotencyStore();
  const app = createApp({
    getContainer: () => container,
    verifyToken: async (token) => {
      const claims = CLAIMS[token];
      if (!claims) throw new Error('bad token');
      return claims;
    },
    idempotencyStore: () => store,
  });

  async function call(method: string, path: string, o: CallOptions = {}) {
    const token = o.token === undefined ? 'owner' : o.token;
    keySeq += 1;
    const key = o.key === undefined ? `wa-test-key-${String(keySeq).padStart(6, '0')}` : o.key;
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(o.headers ?? {}) };
    if (token) headers.authorization = `Bearer ${token}`;
    if (key && method !== 'GET') headers['idempotency-key'] = key;
    const body = o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body));
    const res = await app.request(path, { method, headers, ...(body === undefined ? {} : { body }) });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed, text };
  }

  async function webhook(payload: unknown, signature?: string) {
    const raw = JSON.stringify(payload);
    const sig = signature ?? signMetaBody(h.deps.env.META_APP_SECRET!, raw);
    const r = await call('POST', '/webhooks/whatsapp', { token: null, key: null, raw, headers: { 'x-hub-signature-256': sig } });
    return { status: r.status, body: r.body };
  }

  return { ...h, app, container, call, webhook };
}

// ---------------------------------------------------------------- webhook payload builders

let wamidSeq = 0;
export const nextWamid = () => `wamid.IN${++wamidSeq}`;

type Msg = Record<string, unknown>;

export function inbound(message: Msg, opts: { phoneNumberId?: string; name?: string } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '27820000000', phone_number_id: opts.phoneNumberId ?? PHONE_NUMBER_ID },
              contacts: [{ wa_id: CUSTOMER_WA, profile: { name: opts.name ?? 'Thandi' } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

const base = (id: string, type: string, ts: Date) => ({ id, from: CUSTOMER_WA, timestamp: String(Math.floor(ts.getTime() / 1000)), type });

export const textMsg = (id = nextWamid(), body = 'hello', ts = NOW): Msg => ({ ...base(id, 'text', ts), text: { body } });
export const buttonMsg = (replyId: string, id = nextWamid(), ts = NOW): Msg => ({
  ...base(id, 'interactive', ts),
  interactive: { type: 'button_reply', button_reply: { id: replyId, title: 'x' } },
});
export const listMsg = (replyId: string, id = nextWamid(), ts = NOW): Msg => ({
  ...base(id, 'interactive', ts),
  interactive: { type: 'list_reply', list_reply: { id: replyId, title: 'x' } },
});
export const templateButtonMsg = (payload: string, id = nextWamid(), ts = NOW): Msg => ({
  ...base(id, 'button', ts),
  button: { payload, text: 'Keep' },
});
export const nfmMsg = (response: Record<string, unknown>, id = nextWamid(), ts = NOW): Msg => ({
  ...base(id, 'interactive', ts),
  interactive: { type: 'nfm_reply', nfm_reply: { name: 'flow', body: 'Sent', response_json: JSON.stringify(response) } },
});

export function statusPayload(wamid: string, status: string, errors?: { code: number; title: string }[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '27820000000', phone_number_id: PHONE_NUMBER_ID },
              statuses: [{ id: wamid, status, timestamp: String(Math.floor(NOW.getTime() / 1000)), recipient_id: CUSTOMER_WA, ...(errors ? { errors } : {}) }],
            },
          },
        ],
      },
    ],
  };
}

export function fieldPayload(field: string, value: Record<string, unknown>, time = 1790000000) {
  return { object: 'whatsapp_business_account', entry: [{ id: WABA_ID, time, changes: [{ field, value }] }] };
}

/** Button/list ids of the n-th last message sent through the fake Graph client. */
export function sentIds(graph: FakeGraph, fromEnd = 1): string[] {
  const p = graph.sent[graph.sent.length - fromEnd]?.payload as any;
  if (!p || p.type !== 'interactive') return [];
  const i = p.interactive;
  if (i.type === 'button') return i.action.buttons.map((b: any) => b.reply.id);
  if (i.type === 'list') return i.action.sections.flatMap((s: any) => s.rows.map((r: any) => r.id));
  return [];
}

export function sentText(graph: FakeGraph, fromEnd = 1): string {
  const p = graph.sent[graph.sent.length - fromEnd]?.payload as any;
  if (!p) return '';
  if (p.type === 'text') return p.text.body;
  if (p.type === 'interactive') return p.interactive.body.text;
  if (p.type === 'template') return `template:${p.template.name}`;
  return '';
}
