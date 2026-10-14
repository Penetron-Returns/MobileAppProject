/**
 * Outbound message builders. They enforce WhatsApp's interactive limits:
 * structural limits (counts, id length, duplicate ids) throw, while display
 * text coming from business data (service or staff names) is truncated
 * deterministically with an ellipsis, so a long name never breaks a send.
 *
 * `OutMessage` is the channel-neutral form the engine emits. `toGraphPayload`
 * turns it into the minimal Cloud API payload.
 */

export const LIMITS = {
  body: 1024,
  textBody: 4096,
  header: 60,
  footer: 60,
  buttons: 3,
  buttonTitle: 20,
  listRows: 10,
  listSections: 10,
  sectionTitle: 24,
  rowTitle: 24,
  rowDescription: 72,
  listButton: 20,
  flowCta: 20,
  id: 200,
} as const;

export interface ReplyButton {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title?: string;
  rows: ListRow[];
}

export type OutMessage =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; body: string; buttons: ReplyButton[]; footer?: string }
  | { kind: 'list'; body: string; button: string; sections: ListSection[] }
  | {
      kind: 'flow';
      flow: 'booking' | 'reschedule';
      body: string;
      cta: string;
      /** Subject the executor signs into the flow token: attempt id or `rs-<appointmentId>` */
      subject: string;
    }
  | { kind: 'template'; name: string; language: string; bodyParams: string[]; quickReplyPayloads?: string[] };

export class MessageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageLimitError';
  }
}

export function clip(value: string, max: number): string {
  const s = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

function clipBody(value: string, max: number): string {
  const chars = Array.from(value.trim());
  if (chars.length <= max) return value.trim();
  return `${chars.slice(0, max - 1).join('')}…`;
}

function checkId(id: string) {
  if (!id || id.length > LIMITS.id) throw new MessageLimitError(`id must be 1..${LIMITS.id} chars`);
}

function checkUnique(ids: string[]) {
  if (new Set(ids).size !== ids.length) throw new MessageLimitError('duplicate ids in one message');
}

export function text(body: string): OutMessage {
  if (!body.trim()) throw new MessageLimitError('text body is empty');
  return { kind: 'text', text: clipBody(body, LIMITS.textBody) };
}

export function buttons(body: string, items: ReplyButton[], footer?: string): OutMessage {
  if (items.length < 1 || items.length > LIMITS.buttons) {
    throw new MessageLimitError(`reply buttons must be 1..${LIMITS.buttons}`);
  }
  items.forEach((b) => checkId(b.id));
  checkUnique(items.map((b) => b.id));
  return {
    kind: 'buttons',
    body: clipBody(body, LIMITS.body),
    buttons: items.map((b) => ({ id: b.id, title: clip(b.title, LIMITS.buttonTitle) })),
    ...(footer ? { footer: clip(footer, LIMITS.footer) } : {}),
  };
}

export function list(body: string, button: string, sections: ListSection[]): OutMessage {
  const nonEmpty = sections.filter((s) => s.rows.length > 0);
  const rows = nonEmpty.flatMap((s) => s.rows);
  if (rows.length < 1 || rows.length > LIMITS.listRows) {
    throw new MessageLimitError(`list rows must be 1..${LIMITS.listRows} in total`);
  }
  if (nonEmpty.length > LIMITS.listSections) throw new MessageLimitError('too many sections');
  rows.forEach((r) => checkId(r.id));
  checkUnique(rows.map((r) => r.id));
  const multi = nonEmpty.length > 1;
  return {
    kind: 'list',
    body: clipBody(body, LIMITS.body),
    button: clip(button, LIMITS.listButton),
    sections: nonEmpty.map((s, i) => ({
      ...(multi || s.title ? { title: clip(s.title ?? `Options ${i + 1}`, LIMITS.sectionTitle) } : {}),
      rows: s.rows.map((r) => ({
        id: r.id,
        title: clip(r.title, LIMITS.rowTitle),
        ...(r.description ? { description: clip(r.description, LIMITS.rowDescription) } : {}),
      })),
    })),
  };
}

export function flow(kind: 'booking' | 'reschedule', body: string, cta: string, subject: string): OutMessage {
  return { kind: 'flow', flow: kind, body: clipBody(body, LIMITS.body), cta: clip(cta, LIMITS.flowCta), subject };
}

export function template(name: string, bodyParams: string[], quickReplyPayloads?: string[], language = 'en'): OutMessage {
  quickReplyPayloads?.forEach(checkId);
  return {
    kind: 'template',
    name,
    language,
    // Template parameters may not contain newlines/tabs or 4+ consecutive spaces.
    bodyParams: bodyParams.map((p) => clip(p || '-', 200)),
    ...(quickReplyPayloads?.length ? { quickReplyPayloads } : {}),
  };
}

/** Message type stored in `messages.type` for an outbound message. */
export function storedType(msg: OutMessage): 'text' | 'interactive' | 'flow' | 'template' {
  if (msg.kind === 'text') return 'text';
  if (msg.kind === 'flow') return 'flow';
  if (msg.kind === 'template') return 'template';
  return 'interactive';
}

/** Minimal JSON stored in `messages.body` (enough for the inbox to render it). */
export function storedBody(msg: OutMessage): Record<string, unknown> {
  switch (msg.kind) {
    case 'text':
      return { text: msg.text };
    case 'buttons':
      return { text: msg.body, buttons: msg.buttons.map((b) => b.title) };
    case 'list':
      return { text: msg.body, rows: msg.sections.flatMap((s) => s.rows.map((r) => r.title)) };
    case 'flow':
      return { text: msg.body, flow: msg.flow };
    case 'template':
      return { template: msg.name, params: msg.bodyParams };
  }
}

export interface FlowSendParams {
  flowId: string;
  flowToken: string;
}

/** Converts an OutMessage into a Cloud API `/messages` payload. */
export function toGraphPayload(to: string, msg: OutMessage, flowParams?: FlowSendParams): Record<string, unknown> {
  const recipient = to.replace(/^\+/, '');
  switch (msg.kind) {
    case 'text':
      return { to: recipient, type: 'text', text: { body: msg.text, preview_url: false } };
    case 'buttons':
      return {
        to: recipient,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: msg.body },
          ...(msg.footer ? { footer: { text: msg.footer } } : {}),
          action: { buttons: msg.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
        },
      };
    case 'list':
      return {
        to: recipient,
        type: 'interactive',
        interactive: { type: 'list', body: { text: msg.body }, action: { button: msg.button, sections: msg.sections } },
      };
    case 'flow': {
      if (!flowParams) throw new MessageLimitError('flow message needs flow id + token');
      return {
        to: recipient,
        type: 'interactive',
        interactive: {
          type: 'flow',
          body: { text: msg.body },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_id: flowParams.flowId,
              flow_token: flowParams.flowToken,
              flow_cta: msg.cta,
              flow_action: 'data_exchange',
            },
          },
        },
      };
    }
    case 'template': {
      const components: Record<string, unknown>[] = [];
      if (msg.bodyParams.length) {
        components.push({ type: 'body', parameters: msg.bodyParams.map((t) => ({ type: 'text', text: t })) });
      }
      (msg.quickReplyPayloads ?? []).forEach((payload, index) => {
        components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] });
      });
      return {
        to: recipient,
        type: 'template',
        template: { name: msg.name, language: { code: msg.language }, ...(components.length ? { components } : {}) },
      };
    }
  }
}
