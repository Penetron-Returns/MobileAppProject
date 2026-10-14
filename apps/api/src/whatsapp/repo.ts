/**
 * Persistence port for the WhatsApp channel. Everything WS-C reads or writes
 * in Postgres goes through this interface, so the engine, webhook, jobs and
 * routes are testable with an in-memory implementation (test/whatsapp/fakes.ts).
 * The Supabase implementation lives in supabaseRepo.ts.
 *
 * Appointments are never written here: bookings go through BookingService.
 * Row shapes are derived from the generated `Database` type.
 */
import type { EscalationReason, WhatsAppAccountStatus } from '@booking/types';
import type { Database } from '@booking/database';
import type { ConvContext } from './engine/types.ts';

type Tables = Database['public']['Tables'];
export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]['Row'];
type Enums = Database['public']['Enums'];

export type MessageStatus = Enums['message_status'];
export type MessageType = Enums['message_type'];
export type TemplateStatusValue = Enums['template_status'];
export type AttemptOutcome = Exclude<Enums['attempt_outcome'], 'in_progress'>;

/** `whatsapp_accounts.flow_ids` */
export interface FlowIds {
  booking?: string;
  reschedule?: string;
}

export type WaAccountRow = Omit<
  Pick<
    Row<'whatsapp_accounts'>,
    | 'id'
    | 'business_id'
    | 'waba_id'
    | 'phone_number_id'
    | 'display_phone'
    | 'verified_name'
    | 'access_token_ciphertext'
    | 'token_expires_at'
    | 'status'
    | 'quality_rating'
    | 'messaging_limit'
    | 'last_health_check_at'
    | 'last_error'
  >,
  'status'
> & { status: WhatsAppAccountStatus; flow_ids: FlowIds };

export type WaAccountPatch = Partial<Omit<WaAccountRow, 'id' | 'business_id'>>;

export type ClientRow = Pick<
  Row<'clients'>,
  'id' | 'business_id' | 'phone_e164' | 'name' | 'email' | 'is_blocked' | 'whatsapp_opt_in'
>;

export type ConversationRow = Pick<
  Row<'conversations'>,
  | 'id'
  | 'business_id'
  | 'client_id'
  | 'state'
  | 'version'
  | 'invalid_input_count'
  | 'window_expires_at'
  | 'last_inbound_at'
  | 'last_message_at'
> & { context: ConvContext };

export type ConversationPatch = Partial<
  Pick<ConversationRow, 'state' | 'context' | 'invalid_input_count' | 'window_expires_at' | 'last_inbound_at' | 'last_message_at'>
>;

export interface MessageInsert {
  business_id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  wa_message_id: string | null;
  type: MessageType;
  /** Minimal JSON; see messages.storedBody() */
  body: Record<string, unknown>;
  status: MessageStatus;
  sent_by?: string | null;
  sent_at?: string | null;
  error?: Record<string, unknown> | null;
}

export type MessagePatch = Partial<Pick<MessageInsert, 'wa_message_id' | 'status' | 'sent_at' | 'error'>>;

export interface MessageRow {
  id: string;
  business_id: string;
  conversation_id: string;
  direction: 'in' | 'out';
  wa_message_id: string | null;
  status: MessageStatus;
  body: Record<string, unknown>;
}

export type TemplateRow = Pick<
  Row<'message_templates'>,
  'id' | 'whatsapp_account_id' | 'name' | 'language' | 'category' | 'meta_template_id' | 'status' | 'rejection_reason'
>;

export type TemplateUpsert = Omit<TemplateRow, 'id'> & { business_id: string; components?: unknown };

export interface EscalationRow {
  id: string;
  business_id: string;
  conversation_id: string;
  client_id: string;
  reason: EscalationReason;
  status: 'open' | 'resolved';
  note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface AppointmentBrief {
  id: string;
  business_id: string;
  client_id: string;
  service_id: string;
  staff_id: string;
  status: Row<'appointments'>['status'];
  starts_at: string;
  service_name: string | null;
  staff_name: string | null;
}

export interface BusinessBrief {
  id: string;
  name: string;
  timezone: string;
}

export type ReminderClaim = Database['public']['Functions']['claim_due_reminders']['Returns'][number];

/** Unfinished webhook events are retried at most this many times. */
export const MAX_WEBHOOK_ATTEMPTS = 5;

export interface WebhookRecord {
  id: string;
  /** 1 on first delivery; >1 when an unfinished event is being retried */
  attempts: number;
}

export interface WaRepo {
  // accounts
  getAccountByPhoneNumberId(phoneNumberId: string): Promise<WaAccountRow | null>;
  getAccountsByWabaId(wabaId: string): Promise<WaAccountRow[]>;
  getAccountByBusiness(businessId: string): Promise<WaAccountRow | null>;
  listAccounts(filter: { statuses?: WhatsAppAccountStatus[]; tokenExpiresBefore?: string }): Promise<WaAccountRow[]>;
  /** Inserts or updates the business's single account row. */
  upsertAccount(businessId: string, patch: WaAccountPatch & { waba_id: string; phone_number_id: string }): Promise<WaAccountRow>;
  updateAccount(id: string, patch: WaAccountPatch): Promise<void>;
  // templates
  listTemplates(accountId: string): Promise<TemplateRow[]>;
  upsertTemplate(row: TemplateUpsert): Promise<void>;
  updateTemplateStatus(
    accountId: string,
    match: { metaTemplateId?: string | null; name?: string | null; language?: string | null },
    patch: { status: TemplateStatusValue; rejection_reason?: string | null; meta_template_id?: string | null },
  ): Promise<number>;
  // webhook events (source = 'whatsapp')
  /**
   * Records an event. Returns null for a duplicate that was already processed
   * (or retried too often); returns the row again for an unfinished one.
   */
  recordWebhookEvent(e: { eventKey: string; accountId: string | null; payload: unknown }): Promise<WebhookRecord | null>;
  finishWebhookEvent(id: string, error: string | null, at: string): Promise<void>;
  // clients
  upsertClientByPhone(businessId: string, phoneE164: string, name: string | null): Promise<ClientRow>;
  getClient(businessId: string, clientId: string): Promise<ClientRow | null>;
  /** Fills blank fields only; never overwrites what the business already has. */
  updateClientDetails(businessId: string, clientId: string, patch: { name?: string; email?: string }): Promise<void>;
  // conversations
  getOrCreateConversation(businessId: string, clientId: string): Promise<ConversationRow>;
  getConversation(id: string, businessId?: string): Promise<ConversationRow | null>;
  /** Compare-and-set on `version`; returns null on conflict. */
  saveConversation(id: string, expectedVersion: number, patch: ConversationPatch): Promise<ConversationRow | null>;
  /** Active (not idle/closed/escalated) conversations whose 24h window has passed. */
  listExpiredConversations(now: string, limit: number): Promise<ConversationRow[]>;
  // messages
  /** Returns null when `wa_message_id` already exists (duplicate delivery). */
  insertMessage(row: MessageInsert): Promise<{ id: string } | null>;
  updateMessage(id: string, patch: MessagePatch): Promise<void>;
  hasMessageWithDedupeKey(conversationId: string, key: string): Promise<boolean>;
  updateMessageStatusByWamid(
    wamid: string,
    patch: { status: MessageStatus; at: string; error?: Record<string, unknown> | null },
  ): Promise<MessageRow | null>;
  // escalations
  openEscalation(e: {
    businessId: string;
    conversationId: string;
    clientId: string;
    reason: EscalationReason;
    note?: string | null;
  }): Promise<{ id: string; created: boolean }>;
  resolveOpenEscalations(businessId: string, conversationId: string, userId: string, at: string): Promise<number>;
  resolveEscalation(businessId: string, id: string, userId: string, note: string | null, at: string): Promise<EscalationRow | null>;
  // booking attempts (channel = 'whatsapp')
  startAttempt(a: { id: string; businessId: string; clientId: string; conversationId: string; sessionKey?: string | null; at: string }): Promise<void>;
  appendAttemptStep(id: string, step: string, at: string): Promise<void>;
  /** Only finishes attempts that are still in progress. */
  finishAttempt(id: string, outcome: AttemptOutcome, extra: { appointmentId?: string; errorCode?: string; at: string }): Promise<void>;
  abandonAttemptsForConversation(conversationId: string, at: string): Promise<number>;
  // appointments (read only), events, misc
  getAppointmentBrief(businessId: string, id: string): Promise<AppointmentBrief | null>;
  insertAppointmentEvent(e: { businessId: string; appointmentId: string; type: 'confirmation_sent'; payload: Record<string, unknown> }): Promise<void>;
  claimDueReminders(now: string, limit: number): Promise<ReminderClaim[]>;
  /** Updates the claimed `reminder_sent` event, keeping offset_minutes and starts_at. */
  setReminderState(claim: Pick<ReminderClaim, 'appointment_id' | 'offset_minutes' | 'starts_at'>, extra: Record<string, unknown>): Promise<void>;
  getBusinessBrief(businessId: string): Promise<BusinessBrief | null>;
  listPushTokens(businessId: string): Promise<string[]>;
}

const STATUS_RANK: Record<MessageStatus, number> = { received: 0, queued: 1, sent: 2, delivered: 3, read: 4, failed: 5 };

/** Statuses only move forward (Meta may deliver them out of order); `failed` always wins. */
export function shouldAdvance(current: MessageStatus, next: MessageStatus): boolean {
  if (next === 'failed') return current !== 'failed';
  if (current === 'failed') return false;
  return STATUS_RANK[next] > STATUS_RANK[current];
}

/** Canonical ISO form used in reminder payloads (matches private.iso_utc). */
export function isoUtc(instant: string): string {
  return new Date(instant).toISOString();
}
