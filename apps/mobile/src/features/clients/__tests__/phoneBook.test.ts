import {
  bookItemLayout,
  buildSections,
  letterIndexAt,
  listChrome,
  lastVisitOf,
  matchesQuery,
  sectionIndexForLetter,
  sectionLetter,
  selectRecent,
  sortKey,
  visitSubtitle,
  type BookAppointment,
  type BookClient,
} from '../phoneBook';

import { Platform } from 'react-native';

const TZ = 'Africa/Johannesburg';
// 2026-10-14 12:00 SAST
const NOW = new Date('2026-10-14T10:00:00.000Z');
const COPY = { today: 'today', noVisits: 'No visits yet' };

function appt(
  startsAt: string,
  extra: Partial<BookAppointment> = {},
): BookAppointment {
  return {
    starts_at: startsAt,
    created_at: '2026-01-01T08:00:00.000Z',
    status: 'completed',
    service: { name: 'Cut' },
    ...extra,
  };
}

function client(
  id: string,
  name: string | null,
  extra: Partial<BookClient> = {},
): BookClient {
  return {
    id,
    name,
    phone_e164: '+27821234567',
    tags: [],
    appointments: [],
    ...extra,
  };
}

describe('sortKey and sectionLetter', () => {
  it.each([
    ['plain', 'Amina Khan', 'amina khan', 'A'],
    ['lower case', 'amina', 'amina', 'A'],
    ['leading accent', 'Émile Roux', 'emile roux', 'E'],
    ['cedilla and umlaut', 'Çağla Öz', 'cagla oz', 'C'],
    ['leading space', '  Zanele', 'zanele', 'Z'],
    ['a digit', '27 Salon', '27 salon', '#'],
    ['a plus sign (a phone number)', '+27 82 123 4567', '+27 82 123 4567', '#'],
  ])('handles %s', (_label, name, key, letter) => {
    expect(sortKey(name)).toBe(key);
    expect(sectionLetter(name)).toBe(letter);
  });
});

describe('buildSections', () => {
  const opts = { query: '', now: NOW, timezone: TZ };

  it('sorts by first name ignoring case and accents, with # last', () => {
    const sections = buildSections(
      [
        client('1', 'zanele Mthembu'),
        client('2', 'Émile Roux'),
        client('3', 'Eve Adams'),
        client('4', 'Anna Bell'),
        client('5', null),
        client('6', 'amy Cole'),
      ],
      opts,
    );
    expect(sections.map((s) => s.letter)).toEqual(['A', 'E', 'Z', '#']);
    expect(sections[0].rows.map((r) => r.name)).toEqual([
      'amy Cole',
      'Anna Bell',
    ]);
    expect(sections[1].rows.map((r) => r.id)).toEqual(['2', '3']);
    expect(sections[3].rows[0].name).toBe('+27 82 123 4567');
  });

  it('breaks ties by id so the order is stable', () => {
    const sections = buildSections(
      [client('b', 'Sam Lee'), client('a', 'sam lee')],
      opts,
    );
    expect(sections[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('marks VIP clients and carries the last visit', () => {
    const [section] = buildSections(
      [
        client('1', 'Priya', {
          tags: ['VIP'],
          appointments: [appt('2026-10-09T08:00:00.000Z')],
        }),
      ],
      opts,
    );
    expect(section.rows[0]).toMatchObject({
      isVip: true,
      visit: { date: '2026-10-09', service: 'Cut' },
    });
  });

  it('filters by a name fragment, ignoring accents', () => {
    const sections = buildSections(
      [client('1', 'Émile Roux'), client('2', 'Anna Bell')],
      { ...opts, query: 'emi' },
    );
    expect(sections.map((s) => s.letter)).toEqual(['E']);
  });

  it('returns no sections for no clients or no match', () => {
    expect(buildSections([], opts)).toEqual([]);
    expect(
      buildSections([client('1', 'Anna')], { ...opts, query: 'zzz' }),
    ).toEqual([]);
  });
});

describe('matchesQuery', () => {
  it.each([
    ['blank', '  ', true],
    ['name', 'ann', true],
    ['phone digits without the country code', '082 123', false],
    ['phone digits with the country code', '2782 123', true],
    ['two digits only', '27', false],
    ['nothing', 'zz', false],
  ])('matches on %s', (_label, query, expected) => {
    expect(matchesQuery(client('1', 'Anna'), query)).toBe(expected);
  });
});

describe('lastVisitOf', () => {
  it.each([
    ['no bookings', [], null],
    ['only a future booking', [appt('2026-10-20T08:00:00.000Z')], null],
    [
      'cancelled and no-show are skipped',
      [
        appt('2026-10-13T08:00:00.000Z', { status: 'cancelled' }),
        appt('2026-10-12T08:00:00.000Z', { status: 'no_show' }),
      ],
      null,
    ],
    [
      'the latest of several',
      [appt('2026-10-01T08:00:00.000Z'), appt('2026-10-09T08:00:00.000Z')],
      { date: '2026-10-09', service: 'Cut' },
    ],
    [
      'a booking later today counts as today',
      [appt('2026-10-14T15:00:00.000Z', { status: 'confirmed' })],
      { date: '2026-10-14', service: 'Cut' },
    ],
    [
      'no service name',
      [appt('2026-10-09T08:00:00.000Z', { service: null })],
      { date: '2026-10-09', service: null },
    ],
  ])('handles %s', (_label, appointments, expected) => {
    expect(lastVisitOf(appointments, NOW, TZ)).toEqual(expected);
  });
});

describe('visitSubtitle', () => {
  const today = '2026-10-14';
  it.each([
    ['no visit', null, 'No visits yet'],
    ['today', { date: '2026-10-14', service: 'Pedicure' }, 'Pedicure · today'],
    [
      'this year',
      { date: '2026-10-09', service: 'Gel Manicure' },
      'Gel Manicure · 9 Oct',
    ],
    [
      'an earlier year',
      { date: '2025-08-12', service: 'Blow-dry' },
      'Blow-dry · 12 Aug 2025',
    ],
    ['no service', { date: '2026-10-09', service: null }, '9 Oct'],
  ])('formats %s', (_label, visit, expected) => {
    expect(visitSubtitle(visit, today, COPY)).toBe(expected);
  });
});

describe('selectRecent', () => {
  const opts = { now: NOW, timezone: TZ };
  const booked = (
    id: string,
    at: string,
    extra: Partial<BookAppointment> = {},
  ) =>
    client(id, id.toUpperCase(), {
      appointments: [appt(at, { created_at: at, ...extra })],
    });

  it('ranks by the newest of booking and message, newest first', () => {
    const clients = [
      client('a', 'A', {
        appointments: [
          appt('2026-10-10T08:00:00.000Z', {
            created_at: '2026-10-01T08:00:00.000Z',
          }),
        ],
      }),
      booked('b', '2026-10-02T08:00:00.000Z'),
      booked('c', '2026-09-01T08:00:00.000Z'),
    ];
    const threads = [
      { last_message_at: '2026-10-13T08:00:00.000Z', client: { id: 'c' } },
    ];
    expect(selectRecent(clients, threads, opts).map((c) => c.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('counts when a future booking was made, not when it starts', () => {
    const future = (id: string, createdAt: string) =>
      client(id, id, {
        appointments: [
          appt('2026-12-01T08:00:00.000Z', {
            status: 'confirmed',
            created_at: createdAt,
          }),
        ],
      });
    const clients = [
      future('far', '2026-06-01T08:00:00.000Z'),
      future('made', '2026-10-13T08:00:00.000Z'),
    ];
    expect(selectRecent(clients, [], opts).map((c) => c.id)).toEqual([
      'made',
      'far',
    ]);
  });

  it('ignores cancelled bookings and clients with no activity', () => {
    const clients = [
      booked('x', '2026-10-12T08:00:00.000Z', { status: 'cancelled' }),
      client('y', 'Y'),
    ];
    expect(selectRecent(clients, [], opts)).toEqual([]);
  });

  it('lists each person once and stops at five', () => {
    const clients = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) =>
      booked(id, `2026-10-0${i + 1}T08:00:00.000Z`),
    );
    const threads = [
      { last_message_at: '2026-10-13T08:00:00.000Z', client: { id: 'g' } },
      { last_message_at: '2026-10-13T09:00:00.000Z', client: { id: 'g' } },
      { last_message_at: null, client: { id: 'a' } },
      { last_message_at: '2026-10-13T09:00:00.000Z', client: null },
    ];
    expect(selectRecent(clients, threads, opts).map((c) => c.id)).toEqual([
      'g',
      'f',
      'e',
      'd',
      'c',
    ]);
  });

  it('breaks ties by id', () => {
    const at = '2026-10-10T08:00:00.000Z';
    const clients = [booked('b', at), booked('a', at)];
    expect(selectRecent(clients, [], opts).map((c) => c.id)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('sectionIndexForLetter', () => {
  const sections = [
    { letter: 'A' },
    { letter: 'F' },
    { letter: 'T' },
    { letter: '#' },
  ];
  it.each([
    ['a letter with a section', 'F', 1],
    ['a letter without one jumps to the next', 'B', 1],
    ['the first letter', 'A', 0],
    ['past the last letter reaches #', 'Z', 3],
  ])('handles %s', (_label, letter, expected) => {
    expect(sectionIndexForLetter(sections, letter)).toBe(expected);
  });

  it('returns -1 with no sections', () => {
    expect(sectionIndexForLetter([], 'A')).toBe(-1);
  });
});

describe('letterIndexAt', () => {
  it.each([
    [0, 0],
    [9, 0],
    [243, 13],
    [485, 25],
    [-20, 0],
    [900, 25],
  ])('maps y=%d in a 486pt strip to letter %d', (y, expected) => {
    expect(letterIndexAt(y, 486)).toBe(expected);
  });

  it('copes with an unmeasured strip', () => {
    expect(letterIndexAt(10, 0)).toBe(0);
  });
});

describe('bookItemLayout', () => {
  const sections = [
    { letter: 'A', rows: [{}, {}] },
    { letter: 'B', rows: [{}] },
  ] as never;
  const layout = bookItemLayout(sections, {
    listHeader: 100,
    sectionHeader: 28,
    row: 60,
    gap: 12,
  });

  it('stacks header, group and footer of each section after the list header', () => {
    expect(layout(0)).toEqual({ index: 0, offset: 100, length: 28 });
    expect(layout(1)).toEqual({ index: 1, offset: 128, length: 132 });
    expect(layout(2)).toEqual({ index: 2, offset: 260, length: 0 });
    expect(layout(3)).toEqual({ index: 3, offset: 260, length: 28 });
    expect(layout(4)).toEqual({ index: 4, offset: 288, length: 72 });
  });
});

describe('listChrome', () => {
  const original = Platform.OS;
  afterEach(() => {
    Platform.OS = original;
  });

  it('iOS fills the screen and insets the content to the 106pt line', () => {
    Platform.OS = 'ios';
    expect(listChrome(54)).toEqual({
      frameTop: 0,
      contentInset: 106,
      topSpacer: 0,
      restOffset: 106,
      jumpViewOffset: 106,
    });
  });

  it('Android starts the list below the nav bar and pads the header', () => {
    Platform.OS = 'android';
    expect(listChrome(24)).toEqual({
      frameTop: 68,
      contentInset: 0,
      topSpacer: 8,
      restOffset: 0,
      jumpViewOffset: 0,
    });
  });

  it.each([
    ['ios', 54],
    ['android', 54],
    ['android', 0],
  ])('%s puts the title at the same place at rest (inset %d)', (os, status) => {
    const c = listChrome(status, os);
    const titleTop = c.frameTop + c.topSpacer + c.contentInset;
    expect(titleTop).toBe(status + 52);
  });

  it('a section jump lands the header on the sticky line on each platform', () => {
    const sections = [
      { letter: 'A', rows: [{}] },
      { letter: 'B', rows: [{}] },
    ] as never;
    for (const os of ['ios', 'android']) {
      const c = listChrome(54, os);
      const layout = bookItemLayout(sections, {
        listHeader: 20 + c.topSpacer,
        sectionHeader: 28,
        row: 60,
        gap: 12,
      });
      // scrollToIndex scrolls to offset - viewOffset; a row at content y sits at
      // frameTop + y - scrollY on screen. Headers stick at frameTop + contentInset.
      const scrollY = layout(3).offset - c.jumpViewOffset;
      const screenY = c.frameTop + layout(3).offset - scrollY;
      expect(screenY).toBe(c.frameTop + c.contentInset);
    }
  });
});
