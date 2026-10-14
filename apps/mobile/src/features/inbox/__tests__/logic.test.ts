import {
  collapseMenuExchange,
  filterThreads,
  messageOptions,
  messageText,
  needsReply,
  replyHoursLeft,
  senderOf,
} from '../logic';

const NOW = new Date('2026-10-14T10:00:00.000Z');

describe('needsReply', () => {
  it.each([
    ['no escalations', [], false],
    ['an open one', [{ status: 'open' as const }], true],
    ['only resolved', [{ status: 'resolved' as const }], false],
  ])('%s', (_l, escalations, expected) => {
    expect(needsReply({ escalations })).toBe(expected);
  });
});

describe('filterThreads', () => {
  const t = (id: string, at: string | null, open: boolean) => ({
    id,
    last_message_at: at,
    escalations: open ? [{ status: 'open' as const }] : [],
  });
  const threads = [
    t('a', '2026-10-14T08:00:00Z', false),
    t('b', '2026-10-14T09:00:00Z', true),
    t('c', '2026-10-14T09:00:00Z', true),
    t('d', null, false),
  ];
  it('lists needs-a-reply threads newest first, ties by id', () => {
    expect(filterThreads(threads, 'needs').map((x) => x.id)).toEqual([
      'b',
      'c',
    ]);
  });
  it('lists everything with undated threads last', () => {
    expect(filterThreads(threads, 'all').map((x) => x.id)).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
  });
});

describe('message body helpers', () => {
  it.each([
    [{ text: 'Hi' }, 'Hi'],
    [{ text: '  ' }, null],
    [{ template: 'x' }, null],
    [null, null],
    [['a'], null],
  ])('messageText(%j)', (body, expected) => {
    expect(messageText(body as never)).toBe(expected);
  });
  it('reads button and row titles', () => {
    expect(messageOptions({ buttons: ['Book', 'Help'] })).toEqual([
      'Book',
      'Help',
    ]);
    expect(messageOptions({ rows: ['A'] })).toEqual(['A']);
    expect(messageOptions({ text: 'x' })).toEqual([]);
  });
});

describe('replyHoursLeft', () => {
  it.each([
    ['unknown window', null, null],
    ['closed', '2026-10-14T09:00:00Z', null],
    ['21h left', '2026-10-15T07:30:00Z', 21],
    ['under an hour still reads 1', '2026-10-14T10:20:00Z', 1],
  ])('%s', (_l, expires, expected) => {
    expect(replyHoursLeft(expires, NOW)).toBe(expected);
  });
});

describe('senderOf', () => {
  it('tells customer, staff and bot apart', () => {
    expect(senderOf({ direction: 'in', sent_by: null })).toBe('customer');
    expect(senderOf({ direction: 'out', sent_by: 'user_1' })).toBe('staff');
    expect(senderOf({ direction: 'out', sent_by: null })).toBe('bot');
  });
});

describe('collapseMenuExchange', () => {
  const m = (i: number, staff = false) => ({
    id: `m${i}`,
    direction: (i % 2 ? 'out' : 'in') as 'in' | 'out',
    sent_by: staff ? 'u' : null,
  });
  it('keeps short threads as they are', () => {
    const out = collapseMenuExchange([m(0), m(1), m(2)]);
    expect(out.every((x) => x.kind === 'message')).toBe(true);
  });
  it('folds the early exchange into one group and keeps the tail', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => m(i));
    const out = collapseMenuExchange(msgs);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ kind: 'bot-group', id: 'm0' });
  });
  it('never hides a staff reply', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => m(i, i === 3));
    expect(collapseMenuExchange(msgs).every((x) => x.kind === 'message')).toBe(
      true,
    );
  });
});
