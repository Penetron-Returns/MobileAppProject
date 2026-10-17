import type { ClovieEmotion } from '@/features/clovie-character';

import type { StoryCard, StoryKind, StoryTone } from './model';

/** The board is drawn on a 402 x 874 pt phone; placements are in those coordinates. */
export const DESIGN_WIDTH = 402;

export type CardVisual =
  'none' | 'detail' | 'people' | 'rows' | 'summary' | 'undo' | 'names';

export interface Placement {
  /** Left edge in design coordinates. Values past the midline are anchored to the right edge. */
  x: number;
  y: number;
  scale: number;
  /** 1 faces right, -1 is mirrored. */
  facing: 1 | -1;
}

export interface CardLayout {
  visual: CardVisual;
  emotion: ClovieEmotion;
  placement: Placement;
  /** The number slides in beside him instead of rising. */
  hasNumberPush: boolean;
  /** Product cards without a list carry the "New" badge. */
  hasBadge: boolean;
  isSearching: boolean;
  isCatching: boolean;
  headlineSize: number;
  /** Narrower headline so the NEW sign has room. */
  headlineWidth: number | null;
}

const TONE_EMOTION: Record<StoryTone, ClovieEmotion> = {
  positive: 'proud',
  neutral: 'curious',
  attention: 'thoughtful',
  concern: 'sympathetic',
};

export function visualFor(card: StoryCard, kind: StoryKind): CardVisual {
  if (card.demo === 'undo') return 'undo';
  if (card.demo === 'names') return 'names';
  const list = card.list;
  if (!list || list.length === 0) return 'none';
  if (kind === 'product') return 'summary';
  if (list.length === 1) return 'detail';
  return list.every((i) => i.detail.trim() === '') ? 'people' : 'rows';
}

export function emotionFor(card: StoryCard, kind: StoryKind): ClovieEmotion {
  if (card.emotion) return card.emotion;
  if (kind === 'product')
    return card.demo === 'names' ? 'curious' : 'presenter';
  return TONE_EMOTION[card.tone];
}

function placementFor(
  visual: CardVisual,
  card: StoryCard,
  isCatching: boolean,
): Placement {
  const right = (y: number, scale = 1): Placement => ({
    x: 290,
    y,
    scale,
    facing: 1,
  });
  switch (visual) {
    case 'detail':
      if (card.number && card.tone === 'neutral') {
        return { x: 114, y: 188, scale: 1.05, facing: -1 };
      }
      if (!card.number) return { x: 24, y: 408, scale: 0.9, facing: 1 };
      return right(186);
    case 'people':
      return right(184, 1.1);
    case 'rows':
      return isCatching
        ? right(182, 1.05)
        : { x: 268, y: 306, scale: 1, facing: 1 };
    case 'names':
      return { x: 292, y: 500, scale: 1.05, facing: -1 };
    case 'undo':
    case 'summary':
      return right(176);
    case 'none':
      return right(card.number ? 186 : 176);
  }
}

export function layoutForCard(card: StoryCard, kind: StoryKind): CardLayout {
  const visual = visualFor(card, kind);
  const emotion = emotionFor(card, kind);
  const isCatching = emotion === 'delighted' && visual === 'rows';
  const placement = placementFor(visual, card, isCatching);
  const hasNumber = card.number !== undefined;
  const isTopRight = placement.x > DESIGN_WIDTH / 2 && placement.y < 300;
  const size = hasNumber
    ? 30
    : card.headline.length <= 14
      ? 42
      : card.headline.length <= 24
        ? 40
        : 38;
  return {
    visual,
    emotion,
    placement,
    hasNumberPush: hasNumber && visual === 'detail' && card.tone === 'neutral',
    hasBadge: kind === 'product' && visual !== 'summary',
    isSearching: card.demo === 'names',
    isCatching,
    headlineSize: size,
    headlineWidth: !hasNumber && isTopRight ? 258 : null,
  };
}

/** Design placement to screen: right-anchored values keep the board's right margin. */
export function placeOnScreen(
  p: Placement,
  width: number,
  topOffset: number,
): { x: number; y: number; scale: number; facing: 1 | -1 } {
  const x = p.x > DESIGN_WIDTH / 2 ? width - (DESIGN_WIDTH - p.x) : p.x;
  return { x, y: p.y + topOffset, scale: p.scale, facing: p.facing };
}
