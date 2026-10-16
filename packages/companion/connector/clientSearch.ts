/**
 * Pure client-name matching for the connector's `clients_search`. One cheap database prefilter (LIKE windows, capped
 * candidates) is followed by an in-memory ranking, so typos and diacritics work without database extensions.
 *
 * Ranking tiers, best first: 0 exact full name, 1 every query word starts a name word, 2 contains, 3 within one edit
 * (only words of 4+ letters). Ties break on the most recent visit, then the name.
 */
import type { ClientRow } from '@booking/features/repositories/rows.ts';

/** Candidates fetched from the database before ranking. */
export const NAME_CANDIDATE_CAP = 200;
const MAX_QUERY_WORDS = 6;
const MIN_FUZZY_LENGTH = 4;
const WINDOW = 3;
/** Letters that commonly carry diacritics: a LIKE `_` matches the accented stored form of the unaccented query. */
const ACCENT_PRONE = /[aeiouycnsz]/g;

/** NFD, strip combining marks, lowercase. */
export const foldName = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

/** Folded words (letters and digits only) of a name or query. */
export const nameWords = (value: string): string[] => foldName(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** LIKE patterns (`%`, `_`) whose union is a superset of every client the query can rank. */
export function candidatePatterns(query: string): string[] {
  const windows = new Set<string>();
  for (const word of nameWords(query).slice(0, MAX_QUERY_WORDS)) {
    const parts = word.length <= WINDOW ? [word] : [word.slice(0, WINDOW), word.slice(-WINDOW)];
    for (const part of parts) if (/[^aeiouycnsz]/.test(part)) windows.add(part.replace(ACCENT_PRONE, '_'));
  }
  return windows.size > 0 ? [...windows].map((w) => `%${w}%`) : ['%'];
}

/** True when `a` and `b` differ by at most one insertion, deletion, substitution or adjacent swap. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // adjacent swap
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i); // insertion / deletion
}

/** Best tier a single query word reaches against the name words, or null when it matches none. */
function wordTier(word: string, words: string[]): 1 | 2 | 3 | null {
  if (words.some((w) => w.startsWith(word))) return 1;
  if (words.some((w) => w.includes(word))) return 2;
  if (word.length >= MIN_FUZZY_LENGTH && words.some((w) => w.length >= MIN_FUZZY_LENGTH && withinOneEdit(word, w))) return 3;
  return null;
}

/** Tier of a client name against a query (0 best, 3 worst), or null when it does not match. */
export function matchTier(query: string, name: string): 0 | 1 | 2 | 3 | null {
  const queryWords = nameWords(query).slice(0, MAX_QUERY_WORDS);
  const words = nameWords(name);
  if (queryWords.length === 0 || words.length === 0) return null;
  if (queryWords.join(' ') === words.join(' ')) return 0;
  let worst = 1;
  for (const word of queryWords) {
    const tier = wordTier(word, words);
    if (tier === null) return null;
    worst = Math.max(worst, tier);
  }
  return worst as 1 | 2 | 3;
}

const visitedAt = (row: ClientRow): number => (row.last_seen_at ? Date.parse(row.last_seen_at) : -Infinity);

/** Matching clients, best first. */
export function rankClientsByName(query: string, rows: ClientRow[]): ClientRow[] {
  return rows
    .flatMap((row) => {
      const tier = row.name ? matchTier(query, row.name) : null;
      return tier === null ? [] : [{ row, tier, key: foldName(row.name ?? '') }];
    })
    .sort((a, b) => a.tier - b.tier || visitedAt(b.row) - visitedAt(a.row) || a.key.localeCompare(b.key))
    .map((entry) => entry.row);
}
