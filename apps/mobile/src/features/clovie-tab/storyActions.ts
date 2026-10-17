import type { StoryCard } from '@/features/stories';

export type StoryActionOutcome = 'voice' | 'coming-soon' | 'none';

/** `clovie://voice` (or the dev scheme) opens voice listening. */
const VOICE_LINK = /^[a-z][a-z0-9+.-]*:\/\/voice\/?$/i;

/** What a card's call to action asks the app to do. */
export function storyActionOutcome(card: StoryCard): StoryActionOutcome {
  const { action } = card;
  if (!action) return 'none';
  if (action.deeplink && VOICE_LINK.test(action.deeplink)) return 'voice';
  if (action.kind === 'invite_lapsed') return 'coming-soon';
  return 'none';
}
