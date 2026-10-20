/** In-memory WaRepo (the WhatsApp tables) for tests. No database. */
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
} from '@booking/app-store/whatsapp/repo.ts';
import { randomUUID } from 'node:crypto';

import type { AppointmentDTO } from '@booking/types';
import { type World, BIZ } from './world.ts';

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
  /** Held client notifications already due (what claim_due_client_notifications would return) */
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

