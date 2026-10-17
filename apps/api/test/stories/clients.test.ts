import { describe, expect, it } from 'vitest';

import { buildClientsStory, cameBack, lapsedAt } from '@booking/features/stories/aggregators/clients.ts';
import { NOW, TZ, client, daysAgo, fact } from './fixtures.ts';

const T = NOW.getTime();
const build = (over: Partial<Parameters<typeof buildClientsStory>[0]> = {}) =>
  buildClientsStory({ now: NOW, timezone: TZ, clients: [], appointments: [], ...over });
const visit = (name: string, days: number, over: Partial<ReturnType<typeof fact>> = {}) =>
  fact({ startsAt: daysAgo(days), status: 'completed', clientName: name, ...over });
const cardOf = (story: ReturnType<typeof build>, id: string) => story?.cards.find((c) => c.id === id);

describe('Client updates', () => {
  it('is null when nothing happened', () => {
    expect(build()).toBeNull();
    // a recent regular is neither new, lapsed nor back
    expect(build({ appointments: [visit('Regular One', 10)] })).toBeNull();
  });

  describe('new clients', () => {
    it('counts clients created in the last 7 days and lists up to 3 names, newest first', () => {
      const story = build({
        clients: [
          client('Thandi Nkosi', daysAgo(1)),
          client('Aisha Patel', daysAgo(2)),
          client('Sipho Zulu', daysAgo(3)),
          client('Lerato Dube', daysAgo(4)),
          client('Old Timer', daysAgo(8)),
        ],
      });
      expect(cardOf(story, 'clients-new')).toMatchObject({
        tone: 'positive',
        headline: '4 new clients',
        number: { value: 4, format: 'count' },
        list: [{ name: 'Thandi', initials: 'TN' }, { name: 'Aisha' }, { name: 'Sipho' }],
      });
      expect(cardOf(story, 'clients-new')?.list).toHaveLength(3);
    });

    it('uses the singular, shows nameless clients generically and never a card for zero', () => {
      const story = build({ clients: [client(null, daysAgo(1), 'c9')] });
      expect(cardOf(story, 'clients-new')).toMatchObject({ headline: '1 new client', list: [{ name: 'A client', initials: '?' }] });
      expect(cardOf(build({ clients: [client('Old', daysAgo(7.5))] }), 'clients-new')).toBeUndefined();
    });

    it('treats the window as (now - 7 days, now]', () => {
      expect(cardOf(build({ clients: [client('Edge', new Date(T - 7 * 86_400_000).toISOString())] }), 'clients-new')).toBeUndefined();
      expect(cardOf(build({ clients: [client('Edge', NOW.toISOString())] }), 'clients-new')).toBeDefined();
    });
  });

  describe('the 6-week lapsed rule', () => {
    it.each([
      ['41 days ago (under 6 weeks)', 41, false],
      ['exactly 42 days ago', 42, false],
      ['43 days ago', 43, true],
      ['a year ago', 365, true],
    ])('a last visit %s is lapsed: %s', (_name, days, lapsed) => {
      expect(lapsedAt([visit('Gone Girl', days)], T).map((l) => l.name)).toEqual(lapsed ? ['Gone Girl'] : []);
    });

    it('ignores clients with something upcoming, who never completed a visit, or whose booking was cancelled', () => {
      const upcoming = fact({ clientName: 'Booked', startsAt: daysAgo(-3), status: 'confirmed', createdAt: daysAgo(2) });
      const cancelledUpcoming = fact({ clientName: 'Cancelled', startsAt: daysAgo(-3), status: 'cancelled', createdAt: daysAgo(2) });
      const result = lapsedAt(
        [visit('Booked', 60), upcoming, visit('Cancelled', 60), cancelledUpcoming, fact({ clientName: 'NoShowOnly', status: 'no_show', startsAt: daysAgo(60) })],
        T,
      );
      expect(result.map((l) => l.name)).toEqual(['Cancelled']);
    });

    it('lists the 3 most recent lapsed clients with "Last visit {date}", an invite action and the total', () => {
      const story = build({ appointments: [visit('A One', 50), visit('B Two', 60), visit('C Three', 70), visit('D Four', 80)] });
      expect(cardOf(story, 'clients-lapsed')).toMatchObject({
        headline: '4 clients haven’t come back',
        number: { value: 4, format: 'count' },
        action: { label: 'Invite them back', kind: 'invite_lapsed' },
        list: [
          { name: 'A', detail: 'Last visit 28 Aug' },
          { name: 'B', detail: 'Last visit 18 Aug' },
          { name: 'C', detail: 'Last visit 8 Aug' },
        ],
      });
    });

    it('is attention when the count rose against 30 days ago', () => {
      // A was lapsed then and now; B crossed 6 weeks only since
      const story = build({ appointments: [visit('A One', 100), visit('B Two', 50)] });
      expect(cardOf(story, 'clients-lapsed')).toMatchObject({ tone: 'attention', body: 'Up from 1 last month.', number: { value: 2 } });
      expect(story?.tone).toBe('attention');
    });

    it('is not attention when the count fell, and says so', () => {
      // C was lapsed 30 days ago and has since come back; A still is
      const story = build({ appointments: [visit('A One', 100), visit('C Three', 90), visit('C Three', 5, { createdAt: daysAgo(6) })] });
      expect(cardOf(story, 'clients-lapsed')).toMatchObject({ tone: 'neutral', body: 'Down from 2 last month.', number: { value: 1 } });
    });

    it('is not attention when the count is the same', () => {
      const story = build({ appointments: [visit('A One', 100)] });
      expect(cardOf(story, 'clients-lapsed')).toMatchObject({ tone: 'neutral', body: 'Same as last month (1).' });
    });

    it('judges 30 days ago by what existed then: a booking made since does not hide an earlier lapse', () => {
      const bookedLater = fact({ clientName: 'Later', startsAt: daysAgo(-10), createdAt: daysAgo(2) });
      expect(lapsedAt([visit('Later', 90), bookedLater], T - 30 * 86_400_000).map((l) => l.name)).toEqual(['Later']);
      expect(lapsedAt([visit('Later', 90), bookedLater], T)).toEqual([]);
    });
  });

  describe('clients who came back', () => {
    it.each([
      ['4 weeks', 28, false],
      ['5 weeks', 35, true],
      ['5 weeks and 6 days', 41, true],
      ['9 weeks', 63, true],
    ])('a gap of %s: back = %s', (_name, gapDays, back) => {
      const result = cameBack([visit('Thandi Nkosi', 2 + gapDays), visit('Thandi Nkosi', 2)], T - 7 * 86_400_000, T);
      expect(result).toHaveLength(back ? 1 : 0);
    });

    it('needs the new visit inside the period and an earlier completed visit', () => {
      const from = T - 7 * 86_400_000;
      expect(cameBack([visit('Newbie', 2)], from, T)).toEqual([]);
      expect(cameBack([visit('Old', 60), visit('Old', 20)], from, T)).toEqual([]);
    });

    it('shows the count, up to 3 names and "Back after N weeks", longest gap first', () => {
      const story = build({
        appointments: [
          visit('A One', 2 + 36), visit('A One', 2),
          visit('B Two', 3 + 70), visit('B Two', 3),
          visit('C Three', 4 + 45), visit('C Three', 4),
          visit('D Four', 5 + 40), visit('D Four', 5),
        ],
      });
      expect(cardOf(story, 'clients-came-back')).toMatchObject({
        tone: 'positive',
        headline: '4 clients are back',
        number: { value: 4, format: 'count' },
        list: [
          { name: 'B', detail: 'Back after 10 weeks' },
          { name: 'C', detail: 'Back after 6 weeks' },
          { name: 'A', detail: 'Back after 5 weeks' }, // ties on the gap go to the alphabetically first name
        ],
      });
    });
  });

  it('keeps money out of it, orders the cards new, lapsed, came back and omits feedback for now', () => {
    const story = build({
      clients: [client('Newbie One', daysAgo(1))],
      appointments: [visit('Gone Girl', 90), visit('Back Again', 2 + 40), visit('Back Again', 2)],
    });
    expect(story?.cards.map((c) => c.id)).toEqual(['clients-new', 'clients-lapsed', 'clients-came-back']);
    expect(story?.cards.some((c) => c.number?.format === 'money')).toBe(false);
    expect(story?.cards.every((c) => c.emotion)).toBe(true);
  });
});
