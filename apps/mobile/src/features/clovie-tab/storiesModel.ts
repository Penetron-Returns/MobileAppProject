import type {
  StoriesResponseDTO,
  StoryCardDTO,
  StoryDTO,
  StoryEventDTO,
} from '@booking/types';

import { EMOTIONS, type ClovieEmotion } from '@/features/clovie-character';
import type {
  Story,
  StoryCard,
  StoryEvent,
  StoryKind,
} from '@/features/stories';

/** The product-updates card set is one synthetic story; it has no id on the server. */
export const PRODUCT_STORY_ID = 'product-updates';

const KIND_ORDER: Record<StoryKind, number> = {
  brief: 0,
  clients: 1,
  business: 2,
  product: 3,
};

const DEMOS = ['undo', 'names'] as const;

function toCard(card: StoryCardDTO): StoryCard {
  const { emotion, demo, ...rest } = card;
  return {
    ...rest,
    emotion: EMOTIONS.includes(emotion as ClovieEmotion)
      ? (emotion as ClovieEmotion)
      : undefined,
    demo: DEMOS.find((d) => d === demo),
  };
}

function toStory(story: StoryDTO): Story {
  return { ...story, cards: story.cards.map(toCard) };
}

/**
 * The API response as the viewer's model: Brief, Client updates, Business
 * update, then Product updates, with empty stories left out. Product updates
 * become one extra story whose ring is "viewed" once the caller has seen them.
 */
export function toAppStories(
  data: StoriesResponseDTO,
  options: { productTitle: string; now: Date },
): Story[] {
  const stories = data.stories.filter((s) => s.cards.length > 0).map(toStory);
  const product = data.productUpdates;
  if (product.cards.length > 0) {
    stories.push({
      id: PRODUCT_STORY_ID,
      kind: 'product',
      title: options.productTitle,
      tone: 'neutral',
      generatedAt: options.now.toISOString(),
      viewed: product.viewed,
      cards: product.cards.map(toCard),
    });
  }
  return stories.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/** The viewer's event as the API's analytics row: ids, kind and a card index only. */
export function toEventDTO(
  event: StoryEvent,
  stories: readonly Story[],
  at: Date,
): StoryEventDTO | null {
  const story = stories.find((s) => s.id === event.storyId);
  if (!story) return null;
  const found = story.cards.findIndex((c) => c.id === event.cardId);
  return {
    storyKind: story.kind,
    storyId: story.id === PRODUCT_STORY_ID ? null : story.id,
    cardIndex: event.cardIndex ?? Math.max(0, found),
    event: event.type,
    at: at.toISOString(),
  };
}

/** The cached response with one story (or the product set) flipped to viewed. */
export function markViewedInData(
  data: StoriesResponseDTO,
  storyId: string,
): StoriesResponseDTO {
  if (storyId === PRODUCT_STORY_ID) {
    return {
      ...data,
      productUpdates: { ...data.productUpdates, viewed: true },
    };
  }
  return {
    ...data,
    stories: data.stories.map((s) =>
      s.id === storyId ? { ...s, viewed: true } : s,
    ),
  };
}
