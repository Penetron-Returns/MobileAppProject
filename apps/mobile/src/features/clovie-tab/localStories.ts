import type { TFunction } from 'i18next';

import type { Story, StoryCard } from '@/features/stories';

import { LOCAL_STORY_PREFIX } from './storiesModel';

export const GUIDE_STORY_ID = `${LOCAL_STORY_PREFIX}guide`;

/** The usual row order; the backend sorts the same way. */
const PLACEHOLDER_KINDS = ['brief', 'clients', 'business', 'product'] as const;

function buildEmptyStory(
  kind: (typeof PLACEHOLDER_KINDS)[number],
  t: TFunction,
  now: Date,
): Story {
  return {
    id: `${LOCAL_STORY_PREFIX}empty-${kind}`,
    kind,
    title: t(`stories.empty.${kind}.title`),
    tone: 'neutral',
    generatedAt: now.toISOString(),
    // Nothing to catch up on, so the ring is the quiet grey one.
    viewed: true,
    cards: [
      {
        id: `empty-${kind}`,
        tone: 'neutral',
        kicker: t(`stories.empty.${kind}.title`),
        headline: t('stories.empty.headline'),
        body: t(`stories.empty.${kind}.body`),
        emotion: 'calm',
      },
    ],
  };
}

/**
 * All four story kinds in their usual order: the backend's story where there
 * is one, a calm "nothing yet" placeholder where there is not.
 */
export function withEmptyKinds(
  stories: readonly Story[],
  t: TFunction,
  now: Date,
): Story[] {
  return PLACEHOLDER_KINDS.flatMap((kind) => {
    const real = stories.filter((s) => s.kind === kind);
    return real.length > 0 ? real : [buildEmptyStory(kind, t, now)];
  });
}

const GUIDE_STEPS = [
  { key: 'meet', emotion: 'curious', hasMic: true },
  { key: 'stories', emotion: 'presenter' },
  { key: 'calendar', emotion: 'proud' },
  { key: 'whatsapp', emotion: 'delighted' },
  { key: 'clients', emotion: 'thoughtful' },
  { key: 'settings', emotion: 'calm' },
] as const satisfies readonly {
  key: string;
  emotion: StoryCard['emotion'];
  hasMic?: boolean;
}[];

/** The always-there walkthrough for a new owner. Content only; nothing here is fetched. */
export function buildGuideStory(
  t: TFunction,
  now: Date,
  isViewed: boolean,
): Story {
  return {
    id: GUIDE_STORY_ID,
    kind: 'guide',
    title: t('stories.guide.title'),
    tone: 'neutral',
    generatedAt: now.toISOString(),
    viewed: isViewed,
    cards: GUIDE_STEPS.map((step) => {
      const card: StoryCard = {
        id: `guide-${step.key}`,
        tone: 'neutral',
        kicker: t(`stories.guide.${step.key}.kicker`),
        headline: t(`stories.guide.${step.key}.headline`),
        body: t(`stories.guide.${step.key}.body`),
        emotion: step.emotion,
      };
      if ('hasMic' in step) {
        card.action = {
          label: t('stories.guide.tryMic'),
          deeplink: 'clovie://voice',
        };
      }
      return card;
    }),
  };
}
