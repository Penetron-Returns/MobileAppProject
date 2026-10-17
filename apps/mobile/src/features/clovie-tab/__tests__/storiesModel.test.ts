import type {
  StoriesResponseDTO,
  StoryCardDTO,
  StoryDTO,
} from '@booking/types';

import {
  markViewedInData,
  PRODUCT_STORY_ID,
  toAppStories,
  toEventDTO,
} from '../storiesModel';
import { storyActionOutcome } from '../storyActions';

const card = (id: string, extra: Partial<StoryCardDTO> = {}): StoryCardDTO => ({
  id,
  tone: 'neutral',
  kicker: 'k',
  headline: 'h',
  ...extra,
});
const story = (
  id: string,
  kind: StoryDTO['kind'],
  cards: StoryCardDTO[],
): StoryDTO => ({
  id,
  kind,
  title: id,
  tone: 'neutral',
  generatedAt: '2026-10-17T05:00:00Z',
  viewed: false,
  cards,
});
const NOW = new Date('2026-10-17T06:00:00Z');
const opts = { productTitle: 'What is new', now: NOW };

describe('toAppStories', () => {
  it('orders Brief, Clients, Business, Product and hides empty stories', () => {
    const data: StoriesResponseDTO = {
      stories: [
        story('biz', 'business', [card('b')]),
        story('empty', 'clients', []),
        story('brief', 'brief', [card('a')]),
      ],
      productUpdates: { viewed: false, cards: [card('p1')] },
    };
    expect(toAppStories(data, opts).map((s) => s.id)).toEqual([
      'brief',
      'biz',
      PRODUCT_STORY_ID,
    ]);
  });

  it('adds no product story without cards', () => {
    const data = { stories: [], productUpdates: { viewed: false, cards: [] } };
    expect(toAppStories(data, opts)).toEqual([]);
  });

  it('keeps known emotions and demos and drops unknown ones', () => {
    const data: StoriesResponseDTO = {
      stories: [
        story('brief', 'brief', [
          card('a', { emotion: 'proud', demo: 'undo' }),
          card('b', { emotion: 'proud', demo: 'mystery' }),
        ]),
      ],
      productUpdates: { viewed: false, cards: [] },
    };
    const [{ cards }] = toAppStories(data, opts);
    expect(cards[0]).toMatchObject({ emotion: 'proud', demo: 'undo' });
    expect(cards[1].demo).toBeUndefined();
  });
});

describe('markViewedInData', () => {
  const data: StoriesResponseDTO = {
    stories: [
      story('a', 'brief', [card('x')]),
      story('b', 'clients', [card('y')]),
    ],
    productUpdates: { viewed: false, cards: [card('p')] },
  };
  it('flips one story only', () => {
    const next = markViewedInData(data, 'a');
    expect(next.stories.map((s) => s.viewed)).toEqual([true, false]);
  });
  it('flips the product set', () => {
    expect(markViewedInData(data, PRODUCT_STORY_ID).productUpdates.viewed).toBe(
      true,
    );
  });
});

describe('toEventDTO', () => {
  const stories = toAppStories(
    {
      stories: [story('s1', 'brief', [card('c0'), card('c1')])],
      productUpdates: { viewed: false, cards: [card('p0')] },
    },
    opts,
  );
  it('carries ids, kind and card index only', () => {
    expect(
      toEventDTO(
        { type: 'card_view', storyId: 's1', cardId: 'c1' },
        stories,
        NOW,
      ),
    ).toEqual({
      storyKind: 'brief',
      storyId: 's1',
      cardIndex: 1,
      event: 'card_view',
      at: NOW.toISOString(),
    });
  });
  it('sends no story id for product cards', () => {
    expect(
      toEventDTO({ type: 'open', storyId: PRODUCT_STORY_ID }, stories, NOW),
    ).toMatchObject({ storyKind: 'product', storyId: null, cardIndex: 0 });
  });
  it('ignores events for unknown stories', () => {
    expect(
      toEventDTO({ type: 'open', storyId: 'zzz' }, stories, NOW),
    ).toBeNull();
  });
});

describe('storyActionOutcome', () => {
  const base = { id: 'c', tone: 'neutral', kicker: '', headline: '' } as const;
  it.each([
    [{ label: 'Talk', deeplink: 'clovie://voice' }, 'voice'],
    [{ label: 'Talk', deeplink: 'bookingadmin://voice' }, 'voice'],
    [{ label: 'Invite', kind: 'invite_lapsed' }, 'coming-soon'],
    [{ label: 'Other', deeplink: 'clovie://settings' }, 'none'],
  ])('%j is %s', (action, expected) => {
    expect(storyActionOutcome({ ...base, action })).toBe(expected);
  });
  it('is none without an action', () => {
    expect(storyActionOutcome({ ...base })).toBe('none');
  });
});
