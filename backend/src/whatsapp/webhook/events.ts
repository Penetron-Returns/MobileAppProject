/**
 * Parses a WhatsApp Cloud API webhook payload into typed events, each with
 * a dedupe key for `webhook_events`:
 *   msg:<wamid> · status:<wamid>:<status> · tpl:<template_id>:<event>:<ts>
 *   quality:<waba>:<event>:<ts> · account:<waba>:<event>:<ts> · other:<field>:<hash>
 */
import { z } from 'zod';

import { sha256Hex } from '../../lib/crypto.ts';
import type { InboundMessage, RawInput } from '../engine/index.ts';
import type { MessageStatus, MessageType } from '../repo.ts';

const Message = z.looseObject({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .looseObject({
      type: z.string(),
      button_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
      list_reply: z.object({ id: z.string(), title: z.string().optional() }).optional(),
      nfm_reply: z.object({ response_json: z.string(), name: z.string().optional(), body: z.string().optional() }).optional(),
    })
    .optional(),
  button: z.object({ payload: z.string().optional(), text: z.string().optional() }).optional(),
  reaction: z.object({ message_id: z.string().optional(), emoji: z.string().optional() }).optional(),
});

const Status = z.looseObject({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  errors: z.array(z.looseObject({ code: z.number().optional(), title: z.string().optional() })).optional(),
});

const MessagesValue = z.looseObject({
  metadata: z.object({ phone_number_id: z.string(), display_phone_number: z.string().optional() }),
  contacts: z.array(z.looseObject({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
  messages: z.array(Message).optional(),
  statuses: z.array(Status).optional(),
});

const TemplateValue = z.looseObject({
  event: z.string(),
  message_template_id: z.union([z.string(), z.number()]),
  message_template_name: z.string().optional(),
  message_template_language: z.string().optional(),
  reason: z.string().nullish(),
});

const QualityValue = z.looseObject({
  event: z.string(),
  display_phone_number: z.string().optional(),
  current_limit: z.string().optional(),
});

const AccountValue = z.looseObject({ event: z.string() });

export const WebhookPayload = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      time: z.number().optional(),
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
    }),
  ),
});
export type WebhookPayload = z.infer<typeof WebhookPayload>;

export type WaEvent =
  | { type: 'message'; key: string; phoneNumberId: string; message: InboundMessage; raw: unknown }
  | { type: 'status'; key: string; phoneNumberId: string; wamid: string; status: MessageStatus; at: string; errors: { code?: number; title?: string }[]; raw: unknown }
  | { type: 'template_status'; key: string; wabaId: string; templateId: string; name: string | null; language: string | null; event: string; reason: string | null; raw: unknown }
  | { type: 'quality'; key: string; wabaId: string; event: string; displayPhone: string | null; currentLimit: string | null; raw: unknown }
  | { type: 'account_update'; key: string; wabaId: string; event: string; raw: unknown }
  | { type: 'ignored'; key: string; wabaId: string; field: string; raw: unknown };

const STATUS_MAP: Record<string, MessageStatus> = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };

const shortHash = (v: unknown) => sha256Hex(JSON.stringify(v ?? null)).slice(0, 16);

export function extractEvents(payload: WebhookPayload): WaEvent[] {
  const events: WaEvent[] = [];
  for (const entry of payload.entry) {
    const wabaId = entry.id;
    for (const change of entry.changes) {
      const stamp = entry.time ?? shortHash(change.value);
      switch (change.field) {
        case 'messages': {
          const v = MessagesValue.safeParse(change.value);
          if (!v.success) {
            events.push({ type: 'ignored', key: `other:messages:${shortHash(change.value)}`, wabaId, field: 'messages', raw: { field: 'messages', unparsed: true } });
            break;
          }
          const phoneNumberId = v.data.metadata.phone_number_id;
          for (const m of v.data.messages ?? []) {
            const contact = v.data.contacts?.find((c) => c.wa_id === m.from) ?? v.data.contacts?.[0];
            events.push({
              type: 'message',
              key: `msg:${m.id}`,
              phoneNumberId,
              message: toInbound(m, contact?.profile?.name ?? null),
              // Minimal and PII-free: no sender number, profile name or content.
              raw: { phone_number_id: phoneNumberId, wamid: m.id, type: m.type, timestamp: m.timestamp },
            });
          }
          for (const s of v.data.statuses ?? []) {
            const status = STATUS_MAP[s.status];
            if (!status) continue;
            events.push({
              type: 'status',
              key: `status:${s.id}:${s.status}`,
              phoneNumberId,
              wamid: s.id,
              status,
              at: new Date(Number(s.timestamp) * 1000 || Date.now()).toISOString(),
              errors: (s.errors ?? []).map((e) => ({ code: e.code, title: e.title })),
              raw: { phone_number_id: phoneNumberId, wamid: s.id, status: s.status, timestamp: s.timestamp, error_codes: (s.errors ?? []).map((e) => e.code ?? null) },
            });
          }
          break;
        }
        case 'message_template_status_update': {
          const v = TemplateValue.safeParse(change.value);
          if (!v.success) break;
          const templateId = String(v.data.message_template_id);
          events.push({
            type: 'template_status',
            key: `tpl:${templateId}:${v.data.event}:${stamp}`,
            wabaId,
            templateId,
            name: v.data.message_template_name ?? null,
            language: v.data.message_template_language ?? null,
            event: v.data.event,
            reason: v.data.reason ?? null,
            raw: v.data,
          });
          break;
        }
        case 'phone_number_quality_update': {
          const v = QualityValue.safeParse(change.value);
          if (!v.success) break;
          events.push({
            type: 'quality',
            key: `quality:${wabaId}:${v.data.event}:${stamp}`,
            wabaId,
            event: v.data.event,
            displayPhone: v.data.display_phone_number ?? null,
            currentLimit: v.data.current_limit ?? null,
            raw: v.data,
          });
          break;
        }
        case 'account_update': {
          const v = AccountValue.safeParse(change.value);
          if (!v.success) break;
          events.push({ type: 'account_update', key: `account:${wabaId}:${v.data.event}:${stamp}`, wabaId, event: v.data.event, raw: v.data });
          break;
        }
        default:
          events.push({ type: 'ignored', key: `other:${change.field}:${shortHash(change.value)}`, wabaId, field: change.field, raw: { field: change.field } });
      }
    }
  }
  return events;
}

const MEDIA = new Set(['image', 'audio', 'video', 'document', 'sticker']);

export function toInbound(m: z.infer<typeof Message>, profileName: string | null): InboundMessage {
  const base = { wamid: m.id, from: m.from, profileName, timestamp: new Date(Number(m.timestamp) * 1000 || Date.now()) };
  const make = (type: MessageType, body: Record<string, unknown>, input: RawInput | null): InboundMessage => ({ ...base, type, body, input });

  switch (m.type) {
    case 'text':
      return make('text', { text: m.text?.body ?? '' }, { kind: 'text' });
    case 'interactive': {
      const i = m.interactive;
      if (i?.button_reply) return make('interactive', { id: i.button_reply.id, title: i.button_reply.title ?? null }, { kind: 'button', id: i.button_reply.id });
      if (i?.list_reply) return make('interactive', { id: i.list_reply.id, title: i.list_reply.title ?? null }, { kind: 'list', id: i.list_reply.id });
      if (i?.nfm_reply) {
        let appointmentId: unknown = null;
        try {
          appointmentId = (JSON.parse(i.nfm_reply.response_json) as { appointment_id?: unknown }).appointment_id ?? null;
        } catch {
          appointmentId = null;
        }
        return make('flow', { flow: 'completed', appointment_id: appointmentId }, { kind: 'nfm_reply', responseJson: i.nfm_reply.response_json });
      }
      return make('unknown', { kind: `interactive:${i?.type ?? 'unknown'}` }, { kind: 'unsupported' });
    }
    case 'button':
      return make('button', { payload: m.button?.payload ?? null, text: m.button?.text ?? null }, { kind: 'template_button', payload: m.button?.payload ?? '' });
    case 'reaction':
      return make('reaction', { emoji: m.reaction?.emoji ?? null, message_id: m.reaction?.message_id ?? null }, null);
    case 'system':
      return make('unknown', { kind: 'system' }, null);
    default:
      if (MEDIA.has(m.type)) return make('media', { media_type: m.type }, { kind: 'unsupported' });
      return make('unknown', { kind: m.type }, { kind: 'unsupported' });
  }
}
