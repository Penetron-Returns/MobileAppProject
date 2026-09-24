/**
 * Reply-ID grammar (BUILD_PLAN §5). Every interactive reply and template
 * quick-reply payload is parsed by prefix, never by its visible text.
 * Anything that does not match exactly is rejected (null).
 *
 *   menu:book | menu:bookings | menu:help
 *   svc:<uuid>                svcs:more:<page>
 *   stf:<uuid|any>            stfs:more:<page>
 *   day:<YYYY-MM-DD>          days:more:<page>
 *   slot:<iso>|<uuid|any>     slots:more:<page>
 *   cfm:yes | cfm:no
 *   appt:<uuid> | appt:resched:<uuid> | appt:cancel:<uuid> | appt:keep:<uuid>
 *   appts:more:<page>
 *   nav:back | nav:menu
 */

export type ReplyId =
  | { t: 'menu'; v: 'book' | 'bookings' | 'help' }
  | { t: 'svc'; id: string }
  | { t: 'stf'; id: string | null }
  | { t: 'day'; date: string }
  | { t: 'slot'; startsAt: string; staffId: string | null }
  | { t: 'more'; list: MoreList; page: number }
  | { t: 'cfm'; yes: boolean }
  | { t: 'appt'; action: 'open' | 'resched' | 'cancel' | 'keep'; id: string }
  | { t: 'nav'; v: 'back' | 'menu' };

export type MoreList = 'svcs' | 'stfs' | 'days' | 'slots' | 'appts';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const UUID_RE = new RegExp(`^${UUID}$`);
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const PAGE_RE = /^(0|[1-9]\d{0,2})$/;
const MORE_LISTS: readonly MoreList[] = ['svcs', 'stfs', 'days', 'slots', 'appts'];

export const MAX_ID_LENGTH = 200;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export function isCalendarDate(v: string): boolean {
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isInstant(v: string): boolean {
  return ISO_RE.test(v) && !Number.isNaN(Date.parse(v));
}

export function parseReplyId(raw: unknown): ReplyId | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_ID_LENGTH) return null;
  const idx = raw.indexOf(':');
  if (idx <= 0) return null;
  const prefix = raw.slice(0, idx);
  const rest = raw.slice(idx + 1);

  switch (prefix) {
    case 'menu':
      return rest === 'book' || rest === 'bookings' || rest === 'help' ? { t: 'menu', v: rest } : null;
    case 'svc':
      return isUuid(rest) ? { t: 'svc', id: rest.toLowerCase() } : null;
    case 'stf':
      if (rest === 'any') return { t: 'stf', id: null };
      return isUuid(rest) ? { t: 'stf', id: rest.toLowerCase() } : null;
    case 'day':
      return isCalendarDate(rest) ? { t: 'day', date: rest } : null;
    case 'slot': {
      const bar = rest.lastIndexOf('|');
      if (bar <= 0) return null;
      const iso = rest.slice(0, bar);
      const staff = rest.slice(bar + 1);
      if (!isInstant(iso)) return null;
      if (staff !== 'any' && !isUuid(staff)) return null;
      return { t: 'slot', startsAt: iso, staffId: staff === 'any' ? null : staff.toLowerCase() };
    }
    case 'cfm':
      return rest === 'yes' ? { t: 'cfm', yes: true } : rest === 'no' ? { t: 'cfm', yes: false } : null;
    case 'appt': {
      if (isUuid(rest)) return { t: 'appt', action: 'open', id: rest.toLowerCase() };
      const m = /^(resched|cancel|keep):(.+)$/.exec(rest);
      if (!m || !isUuid(m[2]!)) return null;
      return { t: 'appt', action: m[1] as 'resched' | 'cancel' | 'keep', id: m[2]!.toLowerCase() };
    }
    case 'nav':
      return rest === 'back' || rest === 'menu' ? { t: 'nav', v: rest } : null;
    default: {
      if (!(MORE_LISTS as readonly string[]).includes(prefix)) return null;
      const m = /^more:(.+)$/.exec(rest);
      if (!m || !PAGE_RE.test(m[1]!)) return null;
      return { t: 'more', list: prefix as MoreList, page: Number(m[1]) };
    }
  }
}

export function formatReplyId(id: ReplyId): string {
  switch (id.t) {
    case 'menu':
      return `menu:${id.v}`;
    case 'svc':
      return `svc:${id.id}`;
    case 'stf':
      return `stf:${id.id ?? 'any'}`;
    case 'day':
      return `day:${id.date}`;
    case 'slot':
      return `slot:${id.startsAt}|${id.staffId ?? 'any'}`;
    case 'more':
      return `${id.list}:more:${id.page}`;
    case 'cfm':
      return `cfm:${id.yes ? 'yes' : 'no'}`;
    case 'appt':
      return id.action === 'open' ? `appt:${id.id}` : `appt:${id.action}:${id.id}`;
    case 'nav':
      return `nav:${id.v}`;
  }
}

/** Shorthand builders used by renderers. */
export const rid = {
  menu: (v: 'book' | 'bookings' | 'help') => formatReplyId({ t: 'menu', v }),
  svc: (id: string) => formatReplyId({ t: 'svc', id }),
  stf: (id: string | null) => formatReplyId({ t: 'stf', id }),
  day: (date: string) => formatReplyId({ t: 'day', date }),
  slot: (startsAt: string, staffId: string | null) => formatReplyId({ t: 'slot', startsAt, staffId }),
  more: (list: MoreList, page: number) => formatReplyId({ t: 'more', list, page }),
  cfm: (yes: boolean) => formatReplyId({ t: 'cfm', yes }),
  appt: (action: 'open' | 'resched' | 'cancel' | 'keep', id: string) => formatReplyId({ t: 'appt', action, id }),
  nav: (v: 'back' | 'menu') => formatReplyId({ t: 'nav', v }),
};
