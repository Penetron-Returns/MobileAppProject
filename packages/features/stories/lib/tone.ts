/** Tone rules shared by every story. */
import type { StoryCard, StoryEmotion, StoryTone } from '../types.ts';

const SEVERITY: Record<StoryTone, number> = { positive: 0, neutral: 1, attention: 2, concern: 3 };

/** Clovie's pose follows the card tone; positive and neutral alternate by position so a story is not monotonous. */
export function emotionFor(tone: StoryTone, index = 0): StoryEmotion {
  switch (tone) {
    case 'positive':
      return index % 2 === 0 ? 'proud' : 'delighted';
    case 'neutral':
      return 'curious';
    case 'attention':
      return 'thoughtful';
    case 'concern':
      return 'sympathetic';
  }
}

/**
 * Overall story tone: the highest severity among its cards (concern > attention > neutral > positive),
 * except that a story that is mostly positive (more than half of its cards) is never worse than
 * `neutral` when its worst card is only `attention`. A concern card always wins.
 */
export function overallTone(cards: readonly Pick<StoryCard, 'tone'>[]): StoryTone {
  if (cards.length === 0) return 'neutral';
  let worst: StoryTone = 'positive';
  let positives = 0;
  for (const { tone } of cards) {
    if (SEVERITY[tone] > SEVERITY[worst]) worst = tone;
    if (tone === 'positive') positives += 1;
  }
  if (worst === 'attention' && positives * 2 > cards.length) return 'neutral';
  return worst;
}

/** Gives every card without an explicit emotion the one that matches its tone. cards that did not pick one explicitly. */
export function withEmotions(cards: StoryCard[]): StoryCard[] {
  return cards.map((card, i) => (card.emotion ? card : { ...card, emotion: emotionFor(card.tone, i) }));
}
