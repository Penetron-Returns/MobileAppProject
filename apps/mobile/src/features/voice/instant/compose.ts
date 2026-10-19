/**
 * The spoken answer for an instant intent, from the bookings the app already holds. One or two short sentences,
 * business-timezone times (12 or 24 hour), names as stored, and an empty day or a free slot is said helpfully
 * ("You're free at 3 PM. Your next booking is Olivia at 4:30 PM."). The same text is spoken and shown. Pure: the clock
 * and the translator are injected. Null means "cannot answer this from today's data", which falls through to Clovie.
 */
import { formatTime } from '@/lib/time';

import { nameMatches } from '../checkIn';
import { resolveSpokenTime } from './spokenTime';
import type {
  InstantAppointment,
  InstantData,
  InstantIntent,
  SpokenTime,
} from './types';

type Translate = (key: string, values?: Record<string, unknown>) => string;

export interface ComposeContext {
  now: Date;
  t: Translate;
  /** 12-hour clock ("4:30 PM") when true, 24-hour ("16:30") when false */
  h12: boolean;
}

/** Bookings that still take the owner's time: not cancelled, not a no-show. */
const isActive = (a: InstantAppointment) =>
  a.status === 'confirmed' || a.status === 'completed';

const startMs = (a: InstantAppointment) => Date.parse(a.starts_at);
const endMs = (a: InstantAppointment) => Date.parse(a.ends_at);

function sorted(
  appointments: readonly InstantAppointment[],
): InstantAppointment[] {
  return appointments
    .filter(isActive)
    .sort((a, b) => startMs(a) - startMs(b) || a.id.localeCompare(b.id));
}

function who(a: InstantAppointment, t: Translate): string {
  return a.client?.name?.trim() || t('today.unknownClient');
}

function timeOf(instant: string | number, tz: string, ctx: ComposeContext) {
  return formatTime(instant, tz, ctx.h12);
}

/** "Your next client is Olivia at 4:30 PM" for one booking, with its service when known. */
function describe(
  a: InstantAppointment,
  kind: 'next' | 'first' | 'last',
  tz: string,
  ctx: ComposeContext,
): string {
  const values = {
    name: who(a, ctx.t),
    time: timeOf(a.starts_at, tz, ctx),
    service: a.service?.name?.trim() ?? '',
  };
  const key = `voice.instant.${kind}`;
  return ctx.t(a.service?.name?.trim() ? `${key}WithService` : key, values);
}

function composeNext(data: InstantData, ctx: ComposeContext): string {
  const active = sorted(data.appointments);
  if (active.length === 0) return ctx.t('voice.instant.noBookingsToday');
  const next = active.find(
    (a) =>
      !a.checked_in_at &&
      a.status === 'confirmed' &&
      startMs(a) > ctx.now.getTime(),
  );
  return next
    ? describe(next, 'next', data.timezone, ctx)
    : ctx.t('voice.instant.noMoreToday');
}

function composeCount(data: InstantData, ctx: ComposeContext): string {
  const active = sorted(data.appointments);
  if (active.length === 0) return ctx.t('voice.instant.noBookingsToday');
  const remaining = active.filter((a) => endMs(a) > ctx.now.getTime()).length;
  const total = ctx.t('voice.instant.count', { count: active.length });
  if (remaining === active.length) return total;
  return `${total} ${ctx.t(
    remaining === 0 ? 'voice.instant.allDone' : 'voice.instant.remaining',
    { count: remaining },
  )}`;
}

function composeEdge(
  which: 'first' | 'last',
  data: InstantData,
  ctx: ComposeContext,
): string {
  const active = sorted(data.appointments);
  if (active.length === 0) return ctx.t('voice.instant.noBookingsToday');
  const pick = which === 'first' ? active[0] : active[active.length - 1];
  return describe(pick, which, data.timezone, ctx);
}

/** The single staff member a spoken name means among today's bookings, or null (none, or two of them). */
function resolveStaff(
  spoken: string,
  appointments: readonly InstantAppointment[],
): string | null {
  const names = new Set<string>();
  for (const a of appointments) {
    const name = a.staff?.name;
    if (name && nameMatches(spoken, name)) names.add(name);
  }
  return names.size === 1 ? [...names][0] : null;
}

function composeFreeAt(
  time: SpokenTime,
  staffSpoken: string | undefined,
  data: InstantData,
  ctx: ComposeContext,
): string | null {
  const resolved = resolveSpokenTime(time, {
    now: ctx.now,
    timezone: data.timezone,
  });
  if (!resolved) return null;
  let pool = data.appointments;
  let staffName: string | null = null;
  if (staffSpoken) {
    staffName = resolveStaff(staffSpoken, data.appointments);
    if (!staffName) return null;
    pool = data.appointments.filter((a) => a.staff?.name === staffName);
  }
  const active = sorted(pool);
  const at = resolved.at.getTime();
  const during = active.filter((a) => startMs(a) <= at && endMs(a) > at);
  const isNow = time.kind === 'now';
  const timeText = timeOf(at, data.timezone, ctx);
  const subject = { staff: staffName ?? '', time: timeText };
  const prefix = staffName ? 'voice.instant.staff' : 'voice.instant';
  if (during.length > 0) {
    const until = timeOf(Math.max(...during.map(endMs)), data.timezone, ctx);
    if (during.length > 1) {
      return ctx.t(`${prefix}.busyMany`, {
        ...subject,
        count: during.length,
        until,
      });
    }
    return ctx.t(`${prefix}.${isNow ? 'busyNow' : 'busy'}`, {
      ...subject,
      name: who(during[0], ctx.t),
      until,
    });
  }
  const free = ctx.t(`${prefix}.${isNow ? 'freeNow' : 'free'}`, subject);
  const next = active.find((a) => startMs(a) > at);
  const tail = next
    ? ctx.t(`${prefix}.thenNext`, {
        name: who(next, ctx.t),
        time: timeOf(next.starts_at, data.timezone, ctx),
      })
    : ctx.t(`${prefix}.nothingElse`);
  return `${free} ${tail}`;
}

function composeClientTime(
  spoken: string,
  data: InstantData,
  ctx: ComposeContext,
): string | null {
  const matches = sorted(data.appointments).filter((a) =>
    nameMatches(spoken, a.client?.name ?? null),
  );
  if (matches.length === 0 || matches.length > 3) return null;
  const tz = data.timezone;
  if (matches.length === 1) {
    const [a] = matches;
    const values = { name: who(a, ctx.t), time: timeOf(a.starts_at, tz, ctx) };
    if (a.checked_in_at) return ctx.t('voice.instant.clientHere', values);
    return ctx.t(
      startMs(a) < ctx.now.getTime()
        ? 'voice.instant.clientWas'
        : 'voice.instant.clientAt',
      values,
    );
  }
  const list = matches
    .map((a) =>
      ctx.t('voice.instant.listItem', {
        name: who(a, ctx.t),
        time: timeOf(a.starts_at, tz, ctx),
      }),
    )
    .join(ctx.t('voice.instant.listJoin'));
  return ctx.t('voice.instant.clientMany', { count: matches.length, list });
}

/** The answer for `intent` from today's data, or null when today's data cannot answer it. */
export function composeAnswer(
  intent: InstantIntent,
  data: InstantData,
  ctx: ComposeContext,
): string | null {
  switch (intent.kind) {
    case 'next':
      return composeNext(data, ctx);
    case 'count':
      return composeCount(data, ctx);
    case 'edge':
      return composeEdge(intent.which, data, ctx);
    case 'free_at':
      return composeFreeAt(intent.time, intent.staff, data, ctx);
    case 'client_time':
      return composeClientTime(intent.name, data, ctx);
  }
}
