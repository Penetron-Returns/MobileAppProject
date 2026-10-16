/**
 * Spelling hints for voice transcription: client first names, so "Thandi" is not heard as "Tandi".
 * Nerova already adds the business name, services and staff first names; this adds only clients.
 * Pure ranking and sanitising, plus one cached repository read. Never logs the names.
 */
import type { UUID } from '@booking/types';
import { addDays, dateInZone, dayBoundsInZone, rangeBounds } from '../../lib/time.ts';
import type { BookingRepository } from '../../repositories/types.ts';

/** Nerova's limits for the `vocabulary` field. */
export const MAX_VOCABULARY_TERMS = 50;
export const MAX_VOCABULARY_CHARS = 4096;
const MIN_TERM_CHARS = 2;
const MAX_TERM_CHARS = 40;

export const VOCABULARY_CACHE_TTL_MS = 5 * 60 * 1000;
const RECENT_DAYS = 14;
/** How far back "most frequent" looks. */
const FREQUENCY_DAYS = 90;
const MAX_APPOINTMENT_ROWS = 1000;
/** Names fetched before sanitising and deduplicating trim the list to 50 (keeps the `in (...)` filter short). */
const MAX_CANDIDATE_CLIENTS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

const NAME_RE = /^\p{L}[\p{L}'’-]*$/u;

/** The first word of a full name when it is made of letters, apostrophes and hyphens only (2 to 40 chars), else null. */
export function sanitiseTerm(raw: string | null | undefined): string | null {
  const first = raw?.trim().split(/\s+/)[0] ?? '';
  if (first.length < MIN_TERM_CHARS || first.length > MAX_TERM_CHARS) return null;
  return NAME_RE.test(first) ? first : null;
}

/** Sanitises in order, drops case-insensitive duplicates and stops at 50 terms or 4096 joined characters. */
export function limitVocabulary(names: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  let length = 0;
  for (const name of names) {
    const term = sanitiseTerm(name);
    if (!term || seen.has(term.toLowerCase())) continue;
    const next = length + term.length + (terms.length > 0 ? 1 : 0);
    if (next > MAX_VOCABULARY_CHARS) break;
    seen.add(term.toLowerCase());
    terms.push(term);
    length = next;
    if (terms.length >= MAX_VOCABULARY_TERMS) break;
  }
  return terms;
}

export const joinVocabulary = (terms: readonly string[]): string => terms.join(',');

export interface VocabularyAppointment {
  clientId: UUID;
  startsAtMs: number;
}

/**
 * Client ids by priority: booked today or tomorrow (soonest first), then booked in the last 14 days (latest first),
 * then everyone else in the window by booking count (ties: latest first).
 */
export function rankClientIds(
  appointments: readonly VocabularyAppointment[],
  window: { nowMs: number; soonStartMs: number; soonEndMs: number },
): UUID[] {
  const recentFromMs = window.nowMs - RECENT_DAYS * DAY_MS;
  const soon = new Map<UUID, number>();
  const recent = new Map<UUID, number>();
  const rest = new Map<UUID, { count: number; latestMs: number }>();
  for (const { clientId, startsAtMs } of appointments) {
    const stats = rest.get(clientId) ?? { count: 0, latestMs: 0 };
    rest.set(clientId, { count: stats.count + 1, latestMs: Math.max(stats.latestMs, startsAtMs) });
    if (startsAtMs >= window.soonStartMs && startsAtMs < window.soonEndMs) {
      soon.set(clientId, Math.min(soon.get(clientId) ?? Infinity, startsAtMs));
    } else if (startsAtMs >= recentFromMs && startsAtMs < window.soonStartMs) {
      recent.set(clientId, Math.max(recent.get(clientId) ?? 0, startsAtMs));
    }
  }
  const ordered: UUID[] = [...soon].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  const taken = new Set(ordered);
  for (const [id] of [...recent].sort((a, b) => b[1] - a[1])) {
    if (taken.has(id)) continue;
    ordered.push(id);
    taken.add(id);
  }
  const frequent = [...rest].filter(([id]) => !taken.has(id)).sort((a, b) => b[1].count - a[1].count || b[1].latestMs - a[1].latestMs);
  return [...ordered, ...frequent.map(([id]) => id)];
}

export interface VoiceVocabularyService {
  /** Up to 50 distinct client first names for the business, best first. Cached 5 minutes per business. */
  buildVoiceVocabulary(businessId: UUID): Promise<string[]>;
}

export function createVoiceVocabularyService(deps: { repo: BookingRepository; clock: () => Date }): VoiceVocabularyService {
  const { repo, clock } = deps;
  const cache = new Map<UUID, { terms: string[]; expiresAt: number }>();

  async function load(businessId: UUID, now: Date): Promise<string[]> {
    const business = await repo.getBusiness(businessId);
    if (!business) return [];
    const today = dateInZone(now, business.timezone);
    const soonStartMs = dayBoundsInZone(today, business.timezone).start;
    const soonEndMs = dayBoundsInZone(addDays(today, 1), business.timezone).end;
    const rows = await repo.listAppointmentsInWindow(businessId, {
      fromIso: new Date(now.getTime() - FREQUENCY_DAYS * DAY_MS).toISOString(),
      toIso: new Date(soonEndMs).toISOString(),
      order: 'desc',
      limit: MAX_APPOINTMENT_ROWS,
    });
    const ids = rankClientIds(
      rows.filter((a) => a.status !== 'cancelled').map((a) => ({ clientId: a.client_id, startsAtMs: Date.parse(rangeBounds(a.slot).start) })),
      { nowMs: now.getTime(), soonStartMs, soonEndMs },
    ).slice(0, MAX_CANDIDATE_CLIENTS);
    const clients = await repo.listClientsByIds(businessId, ids);
    const nameOf = new Map(clients.map((c) => [c.id, c.name]));
    return limitVocabulary(ids.map((id) => nameOf.get(id)));
  }

  return {
    async buildVoiceVocabulary(businessId) {
      const now = clock();
      const hit = cache.get(businessId);
      if (hit && hit.expiresAt > now.getTime()) return hit.terms;
      const terms = await load(businessId, now);
      cache.set(businessId, { terms, expiresAt: now.getTime() + VOCABULARY_CACHE_TTL_MS });
      return terms;
    },
  };
}


