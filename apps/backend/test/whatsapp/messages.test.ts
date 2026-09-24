import { describe, expect, it } from 'vitest';

import { formatReplyId, parseReplyId, rid, type ReplyId } from '../../src/whatsapp/ids.ts';
import { buttons, clip, flow, LIMITS, list, MessageLimitError, storedBody, template, text, toGraphPayload } from '../../src/whatsapp/messages.ts';

const long = (n: number) => 'x'.repeat(n);

describe('message builders enforce WhatsApp limits', () => {
  it('allows 1..3 reply buttons and clips titles to 20 chars', () => {
    const m = buttons('Body', [{ id: 'a', title: long(30) }]);
    expect(m.kind === 'buttons' && m.buttons[0]!.title).toHaveLength(LIMITS.buttonTitle);
    expect(() => buttons('Body', [])).toThrow(MessageLimitError);
    expect(() => buttons('Body', [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: 't' })))).toThrow(MessageLimitError);
  });

  it('rejects duplicate, empty and over-long ids', () => {
    expect(() => buttons('B', [{ id: 'a', title: '1' }, { id: 'a', title: '2' }])).toThrow(/duplicate/);
    expect(() => buttons('B', [{ id: '', title: '1' }])).toThrow(MessageLimitError);
    expect(() => list('B', 'Pick', [{ rows: [{ id: long(201), title: 't' }] }])).toThrow(MessageLimitError);
    expect(() => template('t', [], [long(201)])).toThrow(MessageLimitError);
  });

  it('allows at most 10 list rows across sections and clips row text', () => {
    const rows = (n: number, p = 'r') => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, title: long(30), description: long(80) }));
    const m = list('Body', long(30), [{ title: long(30), rows: rows(6) }, { rows: rows(4, 's') }]);
    if (m.kind !== 'list') throw new Error('kind');
    expect(m.button).toHaveLength(LIMITS.listButton);
    expect(m.sections[0]!.title).toHaveLength(LIMITS.sectionTitle);
    expect(m.sections[1]!.title).toBe('Options 2');
    expect(m.sections[0]!.rows[0]!.title).toHaveLength(LIMITS.rowTitle);
    expect(m.sections[0]!.rows[0]!.description).toHaveLength(LIMITS.rowDescription);
    expect(() => list('B', 'Pick', [{ rows: rows(11) }])).toThrow(MessageLimitError);
    expect(() => list('B', 'Pick', [{ rows: [] }])).toThrow(MessageLimitError);
  });

  it('drops empty sections and omits a lone untitled section title', () => {
    const m = list('B', 'Pick', [{ rows: [{ id: 'a', title: 'A' }] }, { title: 'Nav', rows: [] }]);
    expect(m.kind === 'list' && m.sections).toEqual([{ rows: [{ id: 'a', title: 'A' }] }]);
  });

  it('clips bodies to 1024 (interactive) and 4096 (text)', () => {
    const b = buttons(long(2000), [{ id: 'a', title: 'A' }]);
    expect(b.kind === 'buttons' && Array.from(b.body)).toHaveLength(LIMITS.body);
    const t = text(long(5000));
    expect(t.kind === 'text' && Array.from(t.text)).toHaveLength(LIMITS.textBody);
    expect(() => text('   ')).toThrow(MessageLimitError);
  });

  it('clips by characters, not UTF-16 units, and collapses whitespace', () => {
    expect(clip('💇‍♀️ Cut\n\n  and   colour', 12)).toBe('💇‍♀️ Cut an…');
    expect(clip('short', 20)).toBe('short');
  });

  it('keeps template params on one line and never empty', () => {
    const m = template('booking_confirmation', ['A\nB', '', 'C    D']);
    expect(m.kind === 'template' && m.bodyParams).toEqual(['A B', '-', 'C D']);
  });
});

describe('Cloud API payloads', () => {
  it('builds text, buttons, list, flow and template payloads', () => {
    expect(toGraphPayload('+27820000000', text('hi'))).toEqual({ to: '27820000000', type: 'text', text: { body: 'hi', preview_url: false } });
    expect(toGraphPayload('+27820000000', buttons('B', [{ id: 'a', title: 'A' }], 'F'))).toEqual({
      to: '27820000000',
      type: 'interactive',
      interactive: { type: 'button', body: { text: 'B' }, footer: { text: 'F' }, action: { buttons: [{ type: 'reply', reply: { id: 'a', title: 'A' } }] } },
    });
    expect(toGraphPayload('+2782', list('B', 'Pick', [{ rows: [{ id: 'a', title: 'A' }] }]))).toMatchObject({
      interactive: { type: 'list', action: { button: 'Pick', sections: [{ rows: [{ id: 'a', title: 'A' }] }] } },
    });
    expect(toGraphPayload('+2782', flow('booking', 'B', 'Book now', 's'), { flowId: 'f1', flowToken: 'tok' })).toMatchObject({
      interactive: {
        type: 'flow',
        action: { name: 'flow', parameters: { flow_message_version: '3', flow_id: 'f1', flow_token: 'tok', flow_cta: 'Book now', flow_action: 'data_exchange' } },
      },
    });
    expect(() => toGraphPayload('+2782', flow('booking', 'B', 'C', 's'))).toThrow(MessageLimitError);
    expect(toGraphPayload('+2782', template('booking_reminder', ['a'], ['p1', 'p2']))).toEqual({
      to: '2782',
      type: 'template',
      template: {
        name: 'booking_reminder',
        language: { code: 'en' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'a' }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'p1' }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'p2' }] },
        ],
      },
    });
  });

  it('stores a minimal body for the inbox', () => {
    expect(storedBody(buttons('Pick one', [{ id: 'menu:book', title: 'Book' }]))).toEqual({ text: 'Pick one', buttons: ['Book'] });
    expect(storedBody(template('t', ['a']))).toEqual({ template: 't', params: ['a'] });
  });
});

describe('reply-id grammar round trip', () => {
  const U = '00000000-0000-4000-8000-000000000001';
  const all: ReplyId[] = [
    { t: 'menu', v: 'book' },
    { t: 'menu', v: 'bookings' },
    { t: 'menu', v: 'help' },
    { t: 'svc', id: U },
    { t: 'stf', id: U },
    { t: 'stf', id: null },
    { t: 'day', date: '2026-12-31' },
    { t: 'slot', startsAt: '2026-09-30T07:00:00.000Z', staffId: U },
    { t: 'slot', startsAt: '2026-09-30T09:00:00+02:00', staffId: null },
    { t: 'more', list: 'days', page: 1 },
    { t: 'more', list: 'svcs', page: 12 },
    { t: 'cfm', yes: true },
    { t: 'cfm', yes: false },
    { t: 'appt', action: 'open', id: U },
    { t: 'appt', action: 'resched', id: U },
    { t: 'appt', action: 'cancel', id: U },
    { t: 'appt', action: 'keep', id: U },
    { t: 'nav', v: 'back' },
    { t: 'nav', v: 'menu' },
  ];

  it.each(all.map((id) => [formatReplyId(id), id] as const))('%s', (raw, id) => {
    expect(parseReplyId(raw)).toEqual(id);
    expect(raw.length).toBeLessThanOrEqual(LIMITS.id);
  });

  it('normalises uuid case', () => {
    expect(parseReplyId(`svc:${U.toUpperCase()}`)).toEqual({ t: 'svc', id: U });
  });

  it('builds the documented literal forms', () => {
    expect(rid.slot('2026-09-30T07:00:00.000Z', null)).toBe('slot:2026-09-30T07:00:00.000Z|any');
    expect(rid.more('days', 2)).toBe('days:more:2');
    expect(rid.appt('resched', U)).toBe(`appt:resched:${U}`);
  });
});
