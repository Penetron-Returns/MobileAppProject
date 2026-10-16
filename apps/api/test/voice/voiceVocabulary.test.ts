import { describe, expect, it } from 'vitest';

import {
  createVoiceVocabularyService,
  limitVocabulary,
  MAX_VOCABULARY_CHARS,
  MAX_VOCABULARY_TERMS,
  sanitiseTerm,
  VOCABULARY_CACHE_TTL_MS,
} from '@booking/features/bookings/services/voiceVocabulary.ts';
import { addAppointment, addClient, DAY, NOW, vocabularyRepo } from './vocabularyFixtures.ts';

const BIZ = '10000000-0000-4000-8000-0000000000aa';
const OTHER = '10000000-0000-4000-8000-0000000000bb';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
/** Distinct letters-only names: Naaa, Naab, ... */
const nameAt = (i: number, pad = '') => `N${LETTERS[Math.floor(i / 676) % 26]}${LETTERS[Math.floor(i / 26) % 26]}${LETTERS[i % 26]}${pad}`;

describe('sanitiseTerm', () => {
  it.each([
    ['Thandi Nkosi', 'Thandi'],
    ['  Sipho  ', 'Sipho'],
    ["O'Neil Smith", "O'Neil"],
    ['Mary-Ann', 'Mary-Ann'],
    ['Zoë', 'Zoë'],
    ['Al', 'Al'],
  ])('keeps the first word of %j as %j', (raw, expected) => expect(sanitiseTerm(raw)).toBe(expected));

  it.each([
    [null], [undefined], [''], ['   '], ['A'], ['J.'], ['Thandi2'], ['R2D2'], ['+27821234567'], ['-Ann'], ["'x"], ['Bob,Tom'], ['Dr. Who'],
    ['a'.repeat(41)],
  ])('drops %j', (raw) => expect(sanitiseTerm(raw)).toBeNull());

  it('accepts exactly 40 characters', () => expect(sanitiseTerm('a'.repeat(40))).toBe('a'.repeat(40)));
});

describe('limitVocabulary', () => {
  it('deduplicates case-insensitively keeping the first spelling and order', () => {
    expect(limitVocabulary(['Thandi A', 'thandi B', 'SIPHO', 'Sipho', 'Nadia'])).toEqual(['Thandi', 'SIPHO', 'Nadia']);
  });

  it('stops at 50 terms', () => {
    expect(limitVocabulary(Array.from({ length: 80 }, (_, i) => nameAt(i)))).toHaveLength(MAX_VOCABULARY_TERMS);
  });

  it('keeps the joined string within 4096 characters even with the longest names', () => {
    const terms = limitVocabulary(Array.from({ length: 80 }, (_, i) => `${nameAt(i)}${'x'.repeat(36)}`));
    expect(terms.every((t) => t.length === 40)).toBe(true);
    expect(terms.join(',').length).toBeLessThanOrEqual(MAX_VOCABULARY_CHARS);
  });
});

describe('buildVoiceVocabulary', () => {
  function setup() {
    const { repo } = vocabularyRepo(BIZ);
    let now = NOW;
    const calls = { windows: 0 };
    const counting = new Proxy(repo, {
      get(target, prop, receiver) {
        if (prop === 'listAppointmentsInWindow') {
          return (...args: Parameters<typeof repo.listAppointmentsInWindow>) => {
            calls.windows += 1;
            return target.listAppointmentsInWindow(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const service = createVoiceVocabularyService({ repo: counting, clock: () => now });
    return { repo, service, calls, advance: (ms: number) => void (now = new Date(now.getTime() + ms)) };
  }

  it('ranks today and tomorrow, then the last 14 days, then the most frequent', async () => {
    const { repo, service } = setup();
    const c = (name: string) => addClient(repo, BIZ, name);
    const tomorrow = c('Tomorrow One');
    const today = c('Today One');
    const recent = c('Recent One');
    const frequent = c('Frequent One');
    const rare = c('Rare One');
    addAppointment(repo, BIZ, tomorrow.id, DAY);
    addAppointment(repo, BIZ, today.id, 2 * 3_600_000);
    addAppointment(repo, BIZ, recent.id, -3 * DAY);
    for (const d of [20, 30, 40]) addAppointment(repo, BIZ, frequent.id, -d * DAY);
    addAppointment(repo, BIZ, rare.id, -25 * DAY);
    expect(await service.buildVoiceVocabulary(BIZ)).toEqual(['Today', 'Tomorrow', 'Recent', 'Frequent', 'Rare']);
  });

  it('uses the business timezone for today and tomorrow', async () => {
    const { repo, service } = setup();
    // 23:30 SAST today is still today; 00:30 SAST on the third day is not tomorrow.
    addAppointment(repo, BIZ, addClient(repo, BIZ, 'Tonight').id, 11.5 * 3_600_000);
    addAppointment(repo, BIZ, addClient(repo, BIZ, 'Later').id, 2 * DAY + 12.5 * 3_600_000);
    expect(await service.buildVoiceVocabulary(BIZ)).toEqual(['Tonight']);
  });

  it('ignores cancelled appointments, unnamed clients and unusable names', async () => {
    const { repo, service } = setup();
    addAppointment(repo, BIZ, addClient(repo, BIZ, 'Cancelled').id, DAY / 2, 'cancelled');
    addAppointment(repo, BIZ, addClient(repo, BIZ, null).id, DAY / 2);
    addAppointment(repo, BIZ, addClient(repo, BIZ, '+27 82 000 0000').id, DAY / 2);
    addAppointment(repo, BIZ, addClient(repo, BIZ, 'Kept Name').id, DAY / 2);
    expect(await service.buildVoiceVocabulary(BIZ)).toEqual(['Kept']);
  });

  it('returns at most 50 distinct first names', async () => {
    const { repo, service } = setup();
    for (let i = 0; i < 70; i++) addAppointment(repo, BIZ, addClient(repo, BIZ, `${nameAt(i)} Surname`).id, (i + 1) * 60_000);
    addAppointment(repo, BIZ, addClient(repo, BIZ, `${nameAt(0).toLowerCase()} Dup`).id, 5);
    const terms = await service.buildVoiceVocabulary(BIZ);
    expect(terms).toHaveLength(50);
    expect(new Set(terms.map((t) => t.toLowerCase())).size).toBe(50);
  });

  it('only reads the requested business', async () => {
    const { repo, service } = setup();
    repo.tables.businesses.push(vocabularyRepo(OTHER).business);
    addAppointment(repo, OTHER, addClient(repo, OTHER, 'Elsewhere').id, DAY / 2);
    addAppointment(repo, BIZ, addClient(repo, BIZ, 'Mine').id, DAY / 2);
    expect(await service.buildVoiceVocabulary(BIZ)).toEqual(['Mine']);
    expect(await service.buildVoiceVocabulary(OTHER)).toEqual(['Elsewhere']);
  });

  it('caches per business for 5 minutes, then reloads', async () => {
    const { repo, service, calls, advance } = setup();
    addAppointment(repo, BIZ, addClient(repo, BIZ, 'First').id, DAY / 2);
    expect(await service.buildVoiceVocabulary(BIZ)).toEqual(['First']);
    addAppointment(repo, BIZ, addClient(repo, BIZ, 'Second').id, DAY / 4);
    advance(VOCABULARY_CACHE_TTL_MS - 1);
    expect(await service.buildVoiceVocabulary(BIZ)).toEqual(['First']);
    expect(calls.windows).toBe(1);
    advance(1);
    expect(await service.buildVoiceVocabulary(BIZ)).toEqual(['Second', 'First']);
    expect(calls.windows).toBe(2);
  });

  it('is empty for an unknown business', async () => {
    expect(await setup().service.buildVoiceVocabulary(OTHER)).toEqual([]);
  });
});
