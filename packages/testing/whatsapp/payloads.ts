/** Builders for inbound WhatsApp webhook payloads and helpers to read what was sent. */
import { CUSTOMER_WA, NOW, PHONE_NUMBER_ID, WABA_ID } from './world.ts';
import type { FakeGraph } from './fakeGraph.ts';

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
