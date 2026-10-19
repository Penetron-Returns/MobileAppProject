import { withCurrency } from '../currency';
import type { Story } from '../model';
import { SAMPLE_STORIES } from '../sampleStories';

const moneyOf = (stories: Story[]) =>
  stories.flatMap((s) =>
    s.cards.flatMap((c) => (c.number?.format === 'money' ? [c.number] : [])),
  );

describe('withCurrency', () => {
  it('stamps the business currency on money numbers that name none', () => {
    const numbers = moneyOf(withCurrency(SAMPLE_STORIES, 'EUR'));
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((n) => n.currency === 'EUR')).toBe(true);
  });

  it('keeps a currency the story already names', () => {
    const [first] = SAMPLE_STORIES;
    const named = {
      ...first,
      cards: [
        {
          ...first.cards[0],
          number: { value: 100, format: 'money' as const, currency: 'ZAR' },
        },
      ],
    };
    expect(moneyOf(withCurrency([named], 'USD'))[0].currency).toBe('ZAR');
  });

  it('returns the same array while the currency is unknown', () => {
    expect(withCurrency(SAMPLE_STORIES, undefined)).toBe(SAMPLE_STORIES);
  });
});
