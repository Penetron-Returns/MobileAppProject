import type { AppointmentStatus } from '@booking/types';
import { Platform } from 'react-native';

import { formatPhone } from '@/lib/format';
import {
  businessDate,
  formatDayMonth,
  todayISO,
  type ISODate,
} from '@/lib/time';

import { VIP_TAG } from './logic';

/** Pure logic of the Clients phone book: sections, recent people, row copy, layout. */

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
/** Section for names that do not start with a letter. */
export const OTHER_LETTER = '#';
export const RECENT_LIMIT = 5;

export interface BookAppointment {
  starts_at: string;
  created_at: string;
  status: AppointmentStatus;
  service: { name: string } | null;
}

export interface BookClient {
  id: string;
  name: string | null;
  phone_e164: string;
  tags: string[];
  appointments: BookAppointment[];
}

export interface BookThread {
  last_message_at: string | null;
  client: { id: string } | null;
}

export interface LastVisit {
  date: ISODate;
  service: string | null;
}

export interface BookRow {
  id: string;
  name: string;
  phone: string;
  visit: LastVisit | null;
  isVip: boolean;
}

export interface BookSection {
  letter: string;
  rows: BookRow[];
}

export function clientDisplayName(client: {
  name: string | null;
  phone_e164: string;
}): string {
  return client.name?.trim() || formatPhone(client.phone_e164);
}

/** Lower-case, accent-free form used to sort and search names. */
export function sortKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLocaleLowerCase('en');
}

/** "Émile" -> "E"; a name that starts with anything but a letter -> "#". */
export function sectionLetter(name: string): string {
  const first = sortKey(name).charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : OTHER_LETTER;
}

/** Latest booking that is not cancelled or a no-show, starting today or earlier. */
export function lastVisitOf(
  appointments: BookAppointment[],
  now: Date,
  timezone: string,
): LastVisit | null {
  return lastVisitUpTo(appointments, todayISO(timezone, now), timezone);
}

/** `lastVisitOf` with today already resolved, so a whole book resolves it once. */
function lastVisitUpTo(
  appointments: BookAppointment[],
  today: ISODate,
  timezone: string,
): LastVisit | null {
  let best: BookAppointment | null = null;
  for (const a of appointments) {
    if (a.status === 'cancelled' || a.status === 'no_show') continue;
    if (businessDate(a.starts_at, timezone) > today) continue;
    if (!best || a.starts_at > best.starts_at) best = a;
  }
  if (!best) return null;
  return {
    date: businessDate(best.starts_at, timezone),
    service: best.service?.name ?? null,
  };
}

export interface SubtitleCopy {
  /** Lower-case word for today's date. */
  today: string;
  noVisits: string;
}

const dayMonthCache = new Map<ISODate, string>();

/** `formatDayMonth` is Intl work; a book repeats the same few dates. */
function cachedDayMonth(date: ISODate): string {
  let text = dayMonthCache.get(date);
  if (text === undefined) {
    text = formatDayMonth(date);
    dayMonthCache.set(date, text);
  }
  return text;
}

/** "Gel Manicure · 9 Oct", "Pedicure · today"; the year shows once it is not this one. */
export function visitSubtitle(
  visit: LastVisit | null,
  today: ISODate,
  copy: SubtitleCopy,
): string {
  if (!visit) return copy.noVisits;
  const sameYear = visit.date.slice(0, 4) === today.slice(0, 4);
  const when =
    visit.date === today
      ? copy.today
      : sameYear
        ? cachedDayMonth(visit.date)
        : `${cachedDayMonth(visit.date)} ${visit.date.slice(0, 4)}`;
  return visit.service ? `${visit.service} · ${when}` : when;
}

/** Name or phone-digit match, ignoring case and accents; a blank query matches all. */
export function matchesQuery(
  client: { name: string | null; phone_e164: string },
  query: string,
): boolean {
  const q = sortKey(query);
  if (!q) return true;
  if (sortKey(clientDisplayName(client)).includes(q)) return true;
  return phoneMatches(client.phone_e164.replace(/\D/g, ''), q);
}

function phoneMatches(phoneDigits: string, normalisedQuery: string): boolean {
  const digits = normalisedQuery.replace(/\D/g, '');
  return digits.length >= 3 && phoneDigits.includes(digits);
}

/** One client, normalised once so a keystroke only compares strings. */
export interface BookIndexEntry {
  /** `sortKey` of the display name: the sort order and the name search text. */
  key: string;
  /** Digits of the phone number, for number search. */
  digits: string;
  letter: string;
  row: BookRow;
}

/**
 * The searchable, sorted form of the whole book (accent- and case-insensitive
 * by name, ties by id). Build it when the clients change, never per keystroke.
 */
export function buildBookIndex(
  clients: BookClient[],
  options: { now: Date; timezone: string },
): BookIndexEntry[] {
  const { now, timezone } = options;
  const today = todayISO(timezone, now);
  const entries: BookIndexEntry[] = [];
  for (const c of clients) {
    const name = clientDisplayName(c);
    entries.push({
      key: sortKey(name),
      digits: c.phone_e164.replace(/\D/g, ''),
      letter: sectionLetter(name),
      row: {
        id: c.id,
        name,
        phone: c.phone_e164,
        visit: lastVisitUpTo(c.appointments, today, timezone),
        isVip: c.tags.includes(VIP_TAG),
      },
    });
  }
  return entries.sort((a, b) =>
    a.key === b.key ? (a.row.id < b.row.id ? -1 : 1) : a.key < b.key ? -1 : 1,
  );
}

/** A-Z sections of the entries matching `query`; "#" last, empty sections omitted. */
export function sectionsFromIndex(
  index: BookIndexEntry[],
  query: string,
): BookSection[] {
  const q = sortKey(query);
  const byLetter = new Map<string, BookRow[]>();
  for (const entry of index) {
    if (q && !entry.key.includes(q) && !phoneMatches(entry.digits, q)) continue;
    const list = byLetter.get(entry.letter);
    if (list) list.push(entry.row);
    else byLetter.set(entry.letter, [entry.row]);
  }
  const sections: BookSection[] = [];
  for (const [letter, rows] of byLetter) sections.push({ letter, rows });
  return sections.sort((a, b) => {
    if (a.letter === OTHER_LETTER) return 1;
    if (b.letter === OTHER_LETTER) return -1;
    return a.letter < b.letter ? -1 : 1;
  });
}

/**
 * A-Z sections sorted by first name (accent- and case-insensitive, ties by
 * id), non-letters last under "#". Empty sections are not returned.
 */
export function buildSections(
  clients: BookClient[],
  options: { query: string; now: Date; timezone: string },
): BookSection[] {
  return sectionsFromIndex(buildBookIndex(clients, options), options.query);
}

/**
 * The people most recently chatted with or booked: for each client the latest
 * of their newest booking (made, or starting, today or earlier) and their
 * latest WhatsApp message. Newest first, at most `limit`.
 */
export function selectRecent(
  clients: BookClient[],
  threads: BookThread[],
  options: { now: Date; timezone: string; limit?: number },
): BookClient[] {
  const { now, timezone, limit = RECENT_LIMIT } = options;
  const today = todayISO(timezone, now);
  const latest = new Map<string, number>();
  const note = (id: string, iso: string | null) => {
    if (!iso) return;
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return;
    if (at > (latest.get(id) ?? -Infinity)) latest.set(id, at);
  };
  for (const c of clients) {
    for (const a of c.appointments) {
      if (a.status === 'cancelled') continue;
      note(c.id, a.created_at);
      if (businessDate(a.starts_at, timezone) <= today) note(c.id, a.starts_at);
    }
  }
  for (const t of threads) {
    if (t.client) note(t.client.id, t.last_message_at);
  }
  return clients
    .filter((c) => latest.has(c.id))
    .sort((a, b) => {
      const diff = (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0);
      return diff !== 0 ? diff : a.id < b.id ? -1 : 1;
    })
    .slice(0, limit);
}

/**
 * Section to jump to for a letter: the first section at or after it, else
 * the last one (so Z reaches "#"). -1 when there are no sections.
 */
export function sectionIndexForLetter(
  sections: { letter: string }[],
  letter: string,
): number {
  if (sections.length === 0) return -1;
  const at = sections.findIndex(
    (s) => s.letter !== OTHER_LETTER && s.letter >= letter,
  );
  return at === -1 ? sections.length - 1 : at;
}

/** Index of the scrubber letter under a touch `y` inside a strip `height` tall. */
export function letterIndexAt(y: number, height: number): number {
  if (height <= 0) return 0;
  const raw = Math.floor((y / height) * LETTERS.length);
  return Math.min(LETTERS.length - 1, Math.max(0, raw));
}

export type BookItem =
  | { kind: 'header'; key: string; letter: string }
  | {
      kind: 'row';
      key: string;
      row: BookRow;
      isFirst: boolean;
      isLast: boolean;
    };

/**
 * The sections as one flat list (a header item, then one item per client) so a
 * virtualised list mounts only the rows on screen. `headerIndices` holds the
 * index of each section's header, in section order: the sticky headers and the
 * scrubber's jump targets.
 */
export function flattenSections(sections: BookSection[]): {
  items: BookItem[];
  headerIndices: number[];
} {
  const items: BookItem[] = [];
  const headerIndices: number[] = [];
  for (const s of sections) {
    headerIndices.push(items.length);
    items.push({ kind: 'header', key: `h:${s.letter}`, letter: s.letter });
    const last = s.rows.length - 1;
    s.rows.forEach((row, i) => {
      items.push({
        kind: 'row',
        key: row.id,
        row,
        isFirst: i === 0,
        isLast: i === last,
      });
    });
  }
  return { items, headerIndices };
}

export interface BookMetrics {
  /** Height of everything above the first section header. */
  listHeader: number;
  sectionHeader: number;
  row: number;
  /** Clear space under a group, before the next header. */
  gap: number;
}

/**
 * `getItemLayout` for the flat list: a header is `sectionHeader` tall, a row
 * `row`, and the last row of a group adds `gap`. Only valid while rows are
 * exactly `row` tall (the default text size).
 */
export function bookItemLayout(
  items: BookItem[],
  metrics: BookMetrics,
): (index: number) => { length: number; offset: number; index: number } {
  const offsets: { length: number; offset: number }[] = [];
  let offset = metrics.listHeader;
  for (const item of items) {
    const length =
      item.kind === 'header'
        ? metrics.sectionHeader
        : metrics.row + (item.isLast ? metrics.gap : 0);
    offsets.push({ length, offset });
    offset += length;
  }
  return (index) => {
    const hit = offsets[index] ?? { length: 0, offset };
    return { ...hit, index };
  };
}

/** Board: content starts 106pt down on a 54pt status inset, i.e. inset + 52. */
export const CONTENT_TOP_BELOW_INSET = 52;
/** Height of the nav row under the status bar. */
export const NAV_ROW = 44;

export interface ListChrome {
  /** Top of the list frame (Android starts it at the nav bar's bottom edge). */
  frameTop: number;
  /** iOS only: `contentInset.top`, so sticky headers stop at the nav bar. */
  contentInset: number;
  /** Clear space at the top of the list header, above the title. */
  topSpacer: number;
  /** Added to the scroll offset so 0 means "at rest". */
  restOffset: number;
  /** `viewOffset` that lands a section header on the sticky line. */
  jumpViewOffset: number;
}

/**
 * How the list clears the status bar and nav row. iOS lets the list fill the
 * screen and insets its content; Android starts the list frame below the nav
 * bar (no `contentInset` there) and pads the header, so sticky headers stop at
 * the nav bar on both.
 */
export function listChrome(
  statusInset: number,
  os: string = Platform.OS,
): ListChrome {
  const inset = statusInset + CONTENT_TOP_BELOW_INSET;
  if (os === 'ios') {
    return {
      frameTop: 0,
      contentInset: inset,
      topSpacer: 0,
      restOffset: inset,
      jumpViewOffset: inset,
    };
  }
  const bar = statusInset + NAV_ROW;
  return {
    frameTop: bar,
    contentInset: 0,
    topSpacer: inset - bar,
    restOffset: 0,
    jumpViewOffset: 0,
  };
}
