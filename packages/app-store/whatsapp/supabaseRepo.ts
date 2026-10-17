/**
 * Supabase (service-role) implementation of the WhatsApp persistence port.
 * Every business-owned query is filtered by business_id, except lookups that
 * happen before a business is known (account by phone number id / WABA id,
 * webhook events, the global expiry and reminder jobs) and child rows reached
 * through an id the caller already scoped (conversation → messages/attempts).
 */
import type { Json } from '@booking/database';
import type { Db } from '@booking/features/lib/db.ts';
import type { ConvContext } from './engine/types.ts';
import {
  isoUtc,
  MAX_WEBHOOK_ATTEMPTS,
  shouldAdvance,
  type AppointmentBrief,
  type ClientRow,
  type ConversationRow,
  type EscalationRow,
  type FlowIds,
  type MessageRow,
  type MessageStatus,
  type Row,
  type TemplateRow,
  type WaAccountRow,
  type WaRepo,
} from './repo.ts';

class RepoError extends Error {
  constructor(what: string, code?: string) {
    super(`db:${what}${code ? ` (${code})` : ''}`);
    this.name = 'RepoError';
  }
}

/** The success branch of a supabase-js response union. */
type Ok<R> = Extract<R, { error: null }> extends { data: infer D } ? D : never;

function must<R extends { error: { code?: string } | null }>(res: R, what: string): Ok<R> {
  if (res.error) throw new RepoError(what, res.error.code);
  return (res as unknown as { data: Ok<R> }).data;
}

/** jsonb columns: our payloads are plain JSON objects built in code. */
const json = (value: unknown): Json => value as Json;

const ACCOUNT_COLS =
  'id,business_id,waba_id,phone_number_id,display_phone,verified_name,access_token_ciphertext,token_expires_at,flow_ids,status,quality_rating,messaging_limit,last_health_check_at,last_error';
const CLIENT_COLS = 'id,business_id,phone_e164,name,email,is_blocked,whatsapp_opt_in';
const CONV_COLS = 'id,business_id,client_id,state,context,version,invalid_input_count,window_expires_at,last_inbound_at,last_message_at';
const TEMPLATE_COLS = 'id,whatsapp_account_id,name,language,category,meta_template_id,status,rejection_reason';
const ESCALATION_COLS = 'id,business_id,conversation_id,client_id,reason,status,note,resolved_at,resolved_by';

type AccountDbRow = Omit<WaAccountRow, 'flow_ids'> & { flow_ids: Json };
type ConvDbRow = Omit<ConversationRow, 'context'> & { context: Json };

const toAccount = (r: AccountDbRow): WaAccountRow => ({ ...r, flow_ids: (r.flow_ids ?? {}) as FlowIds });
const toConv = (r: ConvDbRow): ConversationRow => ({ ...r, context: (r.context ?? {}) as ConvContext });
const toClient = (r: Pick<Row<'clients'>, keyof ClientRow>): ClientRow => ({
  id: r.id,
  business_id: r.business_id,
  phone_e164: r.phone_e164,
  name: r.name ?? null,
  email: r.email ?? null,
  is_blocked: !!r.is_blocked,
  whatsapp_opt_in: r.whatsapp_opt_in !== false,
});

function accountPatch(patch: Partial<WaAccountRow>) {
  const { flow_ids, id: _id, business_id: _b, ...rest } = patch;
  return { ...rest, ...(flow_ids !== undefined ? { flow_ids: json(flow_ids) } : {}) };
}

export function supabaseWaRepo(db: Db): WaRepo {
  return {
    // ------------------------------------------------------------ accounts
    async getAccountByPhoneNumberId(phoneNumberId) {
      const row = must(await db.from('whatsapp_accounts').select(ACCOUNT_COLS).eq('phone_number_id', phoneNumberId).maybeSingle(), 'account');
      return row ? toAccount(row) : null;
    },
    async getAccountsByWabaId(wabaId) {
      const rows = must(await db.from('whatsapp_accounts').select(ACCOUNT_COLS).eq('waba_id', wabaId), 'accounts');
      return (rows ?? []).map(toAccount);
    },
    async getAccountByBusiness(businessId) {
      const row = must(await db.from('whatsapp_accounts').select(ACCOUNT_COLS).eq('business_id', businessId).maybeSingle(), 'account');
      return row ? toAccount(row) : null;
    },
    async listAccounts(filter) {
      let q = db.from('whatsapp_accounts').select(ACCOUNT_COLS);
      if (filter.statuses?.length) q = q.in('status', filter.statuses);
      if (filter.tokenExpiresBefore) q = q.not('token_expires_at', 'is', null).lt('token_expires_at', filter.tokenExpiresBefore);
      const rows = must(await q.order('id').limit(500), 'accounts');
      return (rows ?? []).map(toAccount);
    },
    async upsertAccount(businessId, patch) {
      const res = await db
        .from('whatsapp_accounts')
        .upsert({ ...accountPatch(patch), business_id: businessId, waba_id: patch.waba_id, phone_number_id: patch.phone_number_id }, { onConflict: 'business_id' })
        .select(ACCOUNT_COLS)
        .single();
      if (res.error?.code === '23505') throw new RepoError('phone_number_taken', '23505');
      return toAccount(must(res, 'account upsert'));
    },
    async updateAccount(id, patch) {
      must(await db.from('whatsapp_accounts').update(accountPatch(patch)).eq('id', id), 'account update');
    },

    // ------------------------------------------------------------ templates
    async listTemplates(accountId) {
      const rows = must(await db.from('message_templates').select(TEMPLATE_COLS).eq('whatsapp_account_id', accountId).order('name'), 'templates');
      return (rows ?? []) as TemplateRow[];
    },
    async upsertTemplate(row) {
      const { components, ...rest } = row;
      must(
        await db
          .from('message_templates')
          .upsert({ ...rest, ...(components !== undefined ? { components: json(components) } : {}) }, { onConflict: 'whatsapp_account_id,name,language' }),
        'template upsert',
      );
    },
    async updateTemplateStatus(accountId, match, patch) {
      let q = db.from('message_templates').update(patch).eq('whatsapp_account_id', accountId);
      if (match.metaTemplateId) q = q.eq('meta_template_id', match.metaTemplateId);
      else {
        if (!match.name) return 0;
        q = q.eq('name', match.name);
        if (match.language) q = q.eq('language', match.language);
      }
      const rows = must(await q.select('id'), 'template status');
      return (rows ?? []).length;
    },

    // ------------------------------------------------------------ webhook events
    async recordWebhookEvent(e) {
      const inserted = await db
        .from('webhook_events')
        .insert({ source: 'whatsapp', event_key: e.eventKey, whatsapp_account_id: e.accountId, payload: json(e.payload), attempts: 1 })
        .select('id')
        .single();
      if (!inserted.error) return { id: inserted.data.id, attempts: 1 };
      if (inserted.error.code !== '23505') throw new RepoError('webhook insert', inserted.error.code);
      const existing = must(
        await db.from('webhook_events').select('id,processed_at,attempts').eq('source', 'whatsapp').eq('event_key', e.eventKey).maybeSingle(),
        'webhook lookup',
      );
      if (!existing || existing.processed_at || existing.attempts >= MAX_WEBHOOK_ATTEMPTS) return null;
      const attempts = existing.attempts + 1;
      must(await db.from('webhook_events').update({ attempts }).eq('id', existing.id), 'webhook retry');
      return { id: existing.id, attempts };
    },
    async finishWebhookEvent(id, error, at) {
      must(await db.from('webhook_events').update({ processed_at: at, error }).eq('id', id), 'webhook finish');
    },

    // ------------------------------------------------------------ clients
    async upsertClientByPhone(businessId, phoneE164, name) {
      const row = must(
        await db.rpc('upsert_client_by_phone', { p_business_id: businessId, p_phone_e164: phoneE164, ...(name ? { p_name: name } : {}) }),
        'upsert client',
      );
      const client = Array.isArray(row) ? row[0] : row;
      if (!client) throw new RepoError('upsert client');
      return toClient(client);
    },
    async getClient(businessId, clientId) {
      const row = must(await db.from('clients').select(CLIENT_COLS).eq('business_id', businessId).eq('id', clientId).maybeSingle(), 'client');
      return row ? toClient(row) : null;
    },
    async updateClientDetails(businessId, clientId, patch) {
      // Two guarded updates so a concurrent edit by staff is never overwritten.
      if (patch.name) {
        must(await db.from('clients').update({ name: patch.name }).eq('business_id', businessId).eq('id', clientId).is('name', null), 'client name');
      }
      if (patch.email) {
        must(await db.from('clients').update({ email: patch.email }).eq('business_id', businessId).eq('id', clientId).is('email', null), 'client email');
      }
    },

    // ------------------------------------------------------------ conversations
    async getOrCreateConversation(businessId, clientId) {
      const existing = must(
        await db.from('conversations').select(CONV_COLS).eq('business_id', businessId).eq('client_id', clientId).maybeSingle(),
        'conversation',
      );
      if (existing) return toConv(existing);
      must(
        await db
          .from('conversations')
          .upsert({ business_id: businessId, client_id: clientId }, { onConflict: 'business_id,client_id', ignoreDuplicates: true }),
        'conversation insert',
      );
      const row = must(await db.from('conversations').select(CONV_COLS).eq('business_id', businessId).eq('client_id', clientId).single(), 'conversation');
      return toConv(row);
    },
    async getConversation(id, businessId) {
      let q = db.from('conversations').select(CONV_COLS).eq('id', id);
      if (businessId) q = q.eq('business_id', businessId);
      const row = must(await q.maybeSingle(), 'conversation');
      return row ? toConv(row) : null;
    },
    async saveConversation(id, expectedVersion, patch) {
      const { context, ...rest } = patch;
      const row = must(
        await db
          .from('conversations')
          .update({ ...rest, ...(context !== undefined ? { context: json(context) } : {}), version: expectedVersion + 1 })
          .eq('id', id)
          .eq('version', expectedVersion)
          .select(CONV_COLS)
          .maybeSingle(),
        'conversation save',
      );
      return row ? toConv(row) : null;
    },
    async listExpiredConversations(now, limit) {
      const rows = must(
        await db
          .from('conversations')
          .select(CONV_COLS)
          .lt('window_expires_at', now)
          .not('state', 'in', '(idle,closed,escalated)')
          .order('window_expires_at')
          .limit(limit),
        'expired conversations',
      );
      return (rows ?? []).map(toConv);
    },

    // ------------------------------------------------------------ messages
    async insertMessage(row) {
      const res = await db
        .from('messages')
        .insert({ ...row, body: json(row.body), error: row.error === undefined ? undefined : json(row.error) })
        .select('id')
        .single();
      if (res.error?.code === '23505') return null;
      return must(res, 'message insert');
    },
    async updateMessage(id, patch) {
      const { error, ...rest } = patch;
      must(await db.from('messages').update({ ...rest, ...(error !== undefined ? { error: json(error) } : {}) }).eq('id', id), 'message update');
    },
    async hasMessageWithDedupeKey(conversationId, key) {
      const rows = must(
        await db.from('messages').select('id').eq('conversation_id', conversationId).eq('body->>dedupe_key', key).limit(1),
        'message dedupe',
      );
      return (rows ?? []).length > 0;
    },
    async updateMessageStatusByWamid(wamid, patch) {
      const current = must(
        await db.from('messages').select('id,business_id,conversation_id,direction,wa_message_id,status,body').eq('wa_message_id', wamid).maybeSingle(),
        'message',
      );
      if (!current) return null;
      const update: { status?: MessageStatus; sent_at?: string; delivered_at?: string; read_at?: string; error?: Json } = {};
      if (shouldAdvance(current.status, patch.status)) update.status = patch.status;
      if (patch.status === 'sent') update.sent_at = patch.at;
      if (patch.status === 'delivered') update.delivered_at = patch.at;
      if (patch.status === 'read') update.read_at = patch.at;
      if (patch.error) update.error = json(patch.error);
      if (Object.keys(update).length) must(await db.from('messages').update(update).eq('id', current.id), 'message status');
      const body = current.body && typeof current.body === 'object' && !Array.isArray(current.body) ? (current.body as Record<string, unknown>) : {};
      const row: MessageRow = { ...current, body, status: update.status ?? current.status };
      return row;
    },

    // ------------------------------------------------------------ escalations
    async openEscalation(e) {
      const res = await db
        .from('escalations')
        .insert({ business_id: e.businessId, conversation_id: e.conversationId, client_id: e.clientId, reason: e.reason, note: e.note ?? null })
        .select('id')
        .single();
      if (res.error?.code === '23505') {
        const open = must(
          await db
            .from('escalations')
            .select('id')
            .eq('business_id', e.businessId)
            .eq('conversation_id', e.conversationId)
            .eq('status', 'open')
            .maybeSingle(),
          'escalation',
        );
        return { id: open?.id ?? '', created: false };
      }
      return { id: must(res, 'escalation insert').id, created: true };
    },
    async resolveOpenEscalations(businessId, conversationId, userId, at) {
      const rows = must(
        await db
          .from('escalations')
          .update({ status: 'resolved', resolved_at: at, resolved_by: userId })
          .eq('business_id', businessId)
          .eq('conversation_id', conversationId)
          .eq('status', 'open')
          .select('id'),
        'escalations resolve',
      );
      return (rows ?? []).length;
    },
    async resolveEscalation(businessId, id, userId, note, at) {
      const current = must(await db.from('escalations').select(ESCALATION_COLS).eq('business_id', businessId).eq('id', id).maybeSingle(), 'escalation');
      if (!current) return null;
      if (current.status === 'resolved') return current as EscalationRow;
      const row = must(
        await db
          .from('escalations')
          .update({ status: 'resolved', resolved_at: at, resolved_by: userId, ...(note ? { note } : {}) })
          .eq('business_id', businessId)
          .eq('id', id)
          .select(ESCALATION_COLS)
          .maybeSingle(),
        'escalation resolve',
      );
      return (row as EscalationRow | null) ?? null;
    },

    // ------------------------------------------------------------ booking attempts
    async startAttempt(a) {
      const res = await db.from('booking_attempts').insert({
        id: a.id,
        business_id: a.businessId,
        channel: 'whatsapp',
        client_id: a.clientId,
        conversation_id: a.conversationId,
        session_key: a.sessionKey ?? `wa:${a.id}`,
        started_at: a.at,
      });
      if (res.error && res.error.code !== '23505') throw new RepoError('attempt insert', res.error.code);
    },
    async appendAttemptStep(id, step, at) {
      const row = must(await db.from('booking_attempts').select('steps,step_count,outcome').eq('id', id).maybeSingle(), 'attempt');
      if (!row) return;
      const steps = Array.isArray(row.steps) ? row.steps : [];
      must(
        await db
          .from('booking_attempts')
          .update({ steps: json([...steps, { step, at }]), step_count: row.step_count + 1 })
          .eq('id', id)
          .eq('step_count', row.step_count),
        'attempt step',
      );
    },
    async finishAttempt(id, outcome, extra) {
      must(
        await db
          .from('booking_attempts')
          .update({
            outcome,
            completed_at: extra.at,
            ...(extra.appointmentId ? { appointment_id: extra.appointmentId } : {}),
            ...(extra.errorCode ? { error_code: extra.errorCode } : {}),
          })
          .eq('id', id)
          .eq('outcome', 'in_progress'),
        'attempt finish',
      );
    },
    async abandonAttemptsForConversation(conversationId, at) {
      const rows = must(
        await db
          .from('booking_attempts')
          .update({ outcome: 'abandoned', completed_at: at })
          .eq('conversation_id', conversationId)
          .eq('channel', 'whatsapp')
          .eq('outcome', 'in_progress')
          .select('id'),
        'attempts abandon',
      );
      return (rows ?? []).length;
    },

    // ------------------------------------------------------------ appointments + events
    async getAppointmentBrief(businessId, id): Promise<AppointmentBrief | null> {
      const row = must(
        await db
          .from('appointments')
          .select('id,business_id,client_id,service_id,staff_id,status,starts_at,services(name),staff(name)')
          .eq('business_id', businessId)
          .eq('id', id)
          .maybeSingle(),
        'appointment',
      );
      if (!row) return null;
      const { services, staff, ...rest } = row;
      return { ...rest, starts_at: isoUtc(rest.starts_at), service_name: services?.name ?? null, staff_name: staff?.name ?? null };
    },
    async insertAppointmentEvent(e) {
      must(
        await db.from('appointment_events').insert({
          business_id: e.businessId,
          appointment_id: e.appointmentId,
          type: e.type,
          actor: 'system',
          actor_id: null,
          payload: json(e.payload),
        }),
        'appointment event',
      );
    },
    async claimDueReminders(now, limit) {
      const rows = must(await db.rpc('claim_due_reminders', { p_now: now, p_limit: limit }), 'claim reminders');
      return (rows ?? []).map((r) => ({ ...r, offset_minutes: Number(r.offset_minutes), starts_at: isoUtc(r.starts_at) }));
    },
    async claimDueClientNotifications(now, limit) {
      return must(await db.rpc('claim_due_client_notifications', { p_now: now, p_limit: limit }), 'claim client notifications') ?? [];
    },
    async setReminderState(claim, extra) {
      const startsAt = isoUtc(claim.starts_at);
      must(
        await db
          .from('appointment_events')
          .update({ payload: json({ ...extra, offset_minutes: claim.offset_minutes, starts_at: startsAt }) })
          .eq('appointment_id', claim.appointment_id)
          .eq('type', 'reminder_sent')
          .eq('payload->>offset_minutes', String(claim.offset_minutes))
          .eq('payload->>starts_at', startsAt),
        'reminder state',
      );
    },
    async getBusinessBrief(businessId) {
      return must(await db.from('businesses').select('id,name,timezone').eq('id', businessId).maybeSingle(), 'business');
    },
    async listPushTokens(businessId) {
      const rows = must(await db.from('device_push_tokens').select('token').eq('business_id', businessId), 'push tokens');
      return (rows ?? []).map((r) => r.token);
    },
  };
}
