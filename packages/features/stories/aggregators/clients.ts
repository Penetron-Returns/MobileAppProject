/**
 * Client updates (docs/stories.md). Pure: `now` and the timezone are inputs.
 *
 * Period: the last 7 days, (now - 7d, now], recomputed on every run (the story's key is the ISO week it was
 * first generated in, so a Monday run reports the week just finished). Cards, only those with content:
 *  - new clients: `clients.createdAt` inside the period;
 *  - not returned: clients whose last completed visit is more than LAPSED_WEEKS weeks old and who have nothing
 *    upcoming. The count now is compared with the count 30 days ago (evaluated at that instant: only visits that
 *    had happened, and bookings that already existed, then). Attention when it rose;
 *  - came back: a completed visit inside the period at least CAME_BACK_WEEKS weeks after the client's previous one;
 *  - feedback: see `buildFeedbackCard`.
 */
import * as t from '../strings.ts';
import type { AppointmentFact, ClientFact, GeneratedStory, StoryCard } from '../types.ts';
import { DAY_MS, WEEK_MS, firstName, initialsOf, shortDate } from '../lib/format.ts';
import { overallTone, withEmotions } from '../lib/tone.ts';

export const LAPSED_WEEKS = 6;
export const CAME_BACK_WEEKS = 5;
export const LAPSED_COMPARE_DAYS = 30;
const LIST_MAX = 3;

export interface ClientsInput {
  now: Date;
  timezone: string;
  clients: ClientFact[];
  /** Appointments, history and future (cancelled ones are ignored) */
  appointments: AppointmentFact[];
}

interface Lapsed {
  clientId: string;
  name: string | null;
  lastVisit: string;
}

const ms = (iso: string) => Date.parse(iso);

/** Clients lapsed as of `at`: last completed visit older than LAPSED_WEEKS and nothing booked for after `at`. */
export function lapsedAt(appointments: AppointmentFact[], at: number): Lapsed[] {
  const lastVisit = new Map<string, { time: number; iso: string; name: string | null }>();
  const hasUpcoming = new Set<string>();
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    const start = ms(a.startsAt);
    if (a.status === 'completed' && start <= at) {
      const seen = lastVisit.get(a.clientId);
      if (!seen || start > seen.time) lastVisit.set(a.clientId, { time: start, iso: a.startsAt, name: a.clientName });
    } else if (start > at && ms(a.createdAt) <= at) {
      hasUpcoming.add(a.clientId);
    }
  }
  const cutoff = at - LAPSED_WEEKS * WEEK_MS;
  return [...lastVisit]
    .filter(([id, v]) => v.time < cutoff && !hasUpcoming.has(id))
    .map(([clientId, v]) => ({ clientId, name: v.name, lastVisit: v.iso }))
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit) || a.clientId.localeCompare(b.clientId));
}

interface ComeBack {
  name: string | null;
  weeks: number;
}

/** Clients with a completed visit in (from, to] that came after a gap of CAME_BACK_WEEKS or more. */
export function cameBack(appointments: AppointmentFact[], from: number, to: number): ComeBack[] {
  const byClient = new Map<string, AppointmentFact[]>();
  for (const a of appointments) {
    if (a.status !== 'completed') continue;
    byClient.set(a.clientId, [...(byClient.get(a.clientId) ?? []), a]);
  }
  const out: ComeBack[] = [];
  for (const visits of byClient.values()) {
    visits.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const latest = visits.findLastIndex((v) => ms(v.startsAt) > from && ms(v.startsAt) <= to);
    const visit = visits[latest];
    const previous = visits[latest - 1];
    if (!visit || !previous) continue;
    const weeks = Math.floor((ms(visit.startsAt) - ms(previous.startsAt)) / WEEK_MS);
    if (weeks >= CAME_BACK_WEEKS) out.push({ name: visit.clientName, weeks });
  }
  return out.sort((a, b) => b.weeks - a.weeks || (a.name ?? '').localeCompare(b.name ?? ''));
}

/**
 * Hook for the feedback card (quotes, rating; 3 stars or fewer is `attention`). It stays null until Nerova collects
 * post-visit feedback on WhatsApp: when that data exists, add it to ClientsInput and build the card here.
 */
export function buildFeedbackCard(_input: ClientsInput): StoryCard | null {
  return null;
}

export function buildClientsStory(input: ClientsInput): GeneratedStory | null {
  const { now, timezone, clients, appointments } = input;
  const to = now.getTime();
  const from = to - WEEK_MS;
  const cards: StoryCard[] = [];

  const fresh = clients
    .filter((c) => ms(c.createdAt) > from && ms(c.createdAt) <= to)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  if (fresh.length > 0) {
    cards.push({
      id: 'clients-new',
      tone: 'positive',
      kicker: t.KICKERS.newClients,
      headline: t.clients.newClients(fresh.length),
      body: t.clients.newClientsBody,
      number: { value: fresh.length, format: 'count' },
      list: fresh.slice(0, LIST_MAX).map((c) => ({ name: firstName(c.name), initials: initialsOf(c.name), detail: t.clients.newClientDetail })),
    });
  }

  const lapsed = lapsedAt(appointments, to);
  if (lapsed.length > 0) {
    const before = lapsedAt(appointments, to - LAPSED_COMPARE_DAYS * DAY_MS).length;
    cards.push({
      id: 'clients-lapsed',
      tone: lapsed.length > before ? 'attention' : 'neutral',
      kicker: t.KICKERS.lapsed,
      headline: t.clients.lapsed(lapsed.length),
      body: t.clients.lapsedBody(lapsed.length, before),
      number: { value: lapsed.length, format: 'count' },
      list: lapsed.slice(0, LIST_MAX).map((l) => ({
        name: firstName(l.name),
        initials: initialsOf(l.name),
        detail: t.clients.lapsedDetail(shortDate(l.lastVisit, timezone)),
      })),
      action: { label: t.clients.inviteBack, kind: 'invite_lapsed' },
    });
  }

  const back = cameBack(appointments, from, to);
  if (back.length > 0) {
    cards.push({
      id: 'clients-came-back',
      tone: 'positive',
      kicker: t.KICKERS.cameBack,
      headline: t.clients.cameBack(back.length),
      number: { value: back.length, format: 'count' },
      list: back.slice(0, LIST_MAX).map((b) => ({ name: firstName(b.name), initials: initialsOf(b.name), detail: t.clients.cameBackDetail(b.weeks) })),
    });
  }

  const feedback = buildFeedbackCard(input);
  if (feedback) cards.push(feedback);

  return cards.length === 0 ? null : { tone: overallTone(cards), cards: withEmotions(cards) };
}
