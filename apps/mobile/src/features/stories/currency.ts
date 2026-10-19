import type { Story } from './model';

/**
 * Stamps the business currency on every money number that names none, so the
 * story cards format money in it. Returns the same array when nothing changes.
 */
export function withCurrency(stories: Story[], currency?: string): Story[] {
  if (!currency) return stories;
  const needs = (c: Story['cards'][number]) =>
    c.number?.format === 'money' && !c.number.currency;
  if (!stories.some((s) => s.cards.some(needs))) return stories;
  return stories.map((story) => ({
    ...story,
    cards: story.cards.map((card) =>
      card.number && needs(card)
        ? { ...card, number: { ...card.number, currency } }
        : card,
    ),
  }));
}
