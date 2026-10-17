import {
  COUNT_STEPS,
  countStep,
  countText,
  easeOutCubic,
  formatCount,
  valueAtStep,
} from '../countUp';
import { layoutForCard, placeOnScreen, visualFor } from '../layout';
import { barScale } from '../motion';
import type { StoryCard } from '../model';
import { clampIndex, isLastCard, navigate, tapAction } from '../navigation';
import { CARD_MS, remainingMs, segmentFill } from '../progress';
import { glowStops, KIND_GLYPHS, TONES } from '../tones';

describe('navigate', () => {
  const counts = [3, 2, 1];

  it.each([
    [{ story: 0, card: 0 }, 'next', { story: 0, card: 1 }, 'card', 1],
    [{ story: 0, card: 2 }, 'next', { story: 1, card: 0 }, 'story', 1],
    [{ story: 1, card: 1 }, 'next', { story: 2, card: 0 }, 'story', 1],
    [{ story: 2, card: 0 }, 'next', { story: 2, card: 0 }, 'close', 1],
    [{ story: 0, card: 2 }, 'prev', { story: 0, card: 1 }, 'card', -1],
    [{ story: 1, card: 0 }, 'prev', { story: 0, card: 0 }, 'story', -1],
    [{ story: 0, card: 0 }, 'prev', { story: 0, card: 0 }, 'restart', -1],
  ] as const)('%j %s', (from, action, position, transition, dir) => {
    expect(navigate(counts, from, action)).toEqual({
      position,
      transition,
      dir,
    });
  });

  it('closes after the last card of the last story only', () => {
    expect(isLastCard(counts, { story: 2, card: 0 })).toBe(true);
    expect(isLastCard(counts, { story: 1, card: 1 })).toBe(false);
  });

  it('sends the left third back and the rest forward', () => {
    expect(tapAction(50, 402)).toBe('prev');
    expect(tapAction(139, 402)).toBe('prev');
    expect(tapAction(140, 402)).toBe('next');
    expect(tapAction(390, 402)).toBe('next');
  });

  it('clamps indices', () => {
    expect(clampIndex(-1, 4)).toBe(0);
    expect(clampIndex(9, 4)).toBe(3);
    expect(clampIndex(2, 0)).toBe(0);
  });
});

describe('progress timing', () => {
  it('fills earlier segments, none after, and the current one by progress', () => {
    expect(segmentFill(0, 1, 0.4)).toBe(1);
    expect(segmentFill(1, 1, 0.4)).toBe(0.4);
    expect(segmentFill(2, 1, 0.4)).toBe(0);
    expect(segmentFill(1, 1, 3)).toBe(1);
    expect(segmentFill(1, 1, -1)).toBe(0);
  });

  it('resumes a held card with the time it has left', () => {
    expect(CARD_MS).toBe(5000);
    expect(remainingMs(0)).toBe(5000);
    expect(remainingMs(0.25)).toBe(3750);
    expect(remainingMs(1)).toBe(0);
    expect(remainingMs(2)).toBe(0);
  });
});

describe('count formatting', () => {
  it.each([
    [5, 'count', undefined, '5'],
    [14800, 'count', undefined, '14,800'],
    [12, 'percent', undefined, '12%'],
    [3, 'count', 'min', '3 min'],
    [245000, 'money', undefined, 'R 2,450'],
    [1480000, 'money', undefined, 'R 14,800'],
    [0, 'money', undefined, 'R 0'],
  ] as const)('%s %s %s -> %s', (value, format, unit, expected) => {
    expect(formatCount(value, format, unit)).toBe(expected);
  });

  it('counts up in 16 eased steps, ending exactly on the value', () => {
    expect(countStep(0)).toBe(0);
    expect(countStep(0.5)).toBe(8);
    expect(countStep(1)).toBe(COUNT_STEPS);
    expect(countStep(9)).toBe(COUNT_STEPS);
    expect(valueAtStep(100, 0)).toBe(0);
    expect(valueAtStep(100, COUNT_STEPS)).toBe(100);
    expect(valueAtStep(100, 4)).toBeGreaterThan(25);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5);
  });

  it('shows the formatted frame for a progress', () => {
    const n = { value: 245000, format: 'money' as const };
    expect(countText(n, 0)).toBe('R 0');
    expect(countText(n, 1)).toBe('R 2,450');
  });
});

describe('tone palettes', () => {
  it('uses the board accents', () => {
    expect(TONES.positive.accent).toBe('#6FE3BC');
    expect(TONES.neutral.accent).toBe('#9DD9F5');
    expect(TONES.attention.accent).toBe('#FFC266');
    expect(TONES.concern.accent).toBe('#FF9E94');
  });

  it('closes every ring gradient on its first colour', () => {
    for (const tone of Object.values(TONES)) {
      expect(tone.ring[0]).toBe(tone.ring[4]);
    }
  });

  it('makes the second glow 60% of the first', () => {
    expect(glowStops('neutral').second.alpha).toBe(0.3);
    expect(glowStops('positive').first.alpha).toBe(0.36);
  });

  it('gives the brief the Clovie image and the others a glyph', () => {
    expect(KIND_GLYPHS.brief.isImage).toBe(true);
    expect(KIND_GLYPHS.clients.isImage).toBe(false);
  });
});

const card = (over: Partial<StoryCard>): StoryCard => ({
  id: 'c',
  tone: 'neutral',
  kicker: 'k',
  headline: 'headline',
  ...over,
});

describe('card layout and Clovie staging', () => {
  it('picks the visual from the card shape', () => {
    const item = { name: 'A B', initials: 'AB', detail: '' };
    const withDetail = { ...item, detail: 'x' };
    expect(visualFor(card({}), 'brief')).toBe('none');
    expect(visualFor(card({ demo: 'undo' }), 'product')).toBe('undo');
    expect(visualFor(card({ demo: 'names' }), 'product')).toBe('names');
    expect(visualFor(card({ list: [withDetail] }), 'brief')).toBe('detail');
    expect(visualFor(card({ list: [item, item] }), 'clients')).toBe('people');
    expect(visualFor(card({ list: [withDetail, withDetail] }), 'clients')).toBe(
      'rows',
    );
    expect(visualFor(card({ list: [withDetail, withDetail] }), 'product')).toBe(
      'summary',
    );
  });

  it('maps tone to a default emotion and product cards to the presenter', () => {
    expect(layoutForCard(card({ tone: 'positive' }), 'clients').emotion).toBe(
      'proud',
    );
    expect(layoutForCard(card({ tone: 'neutral' }), 'brief').emotion).toBe(
      'curious',
    );
    expect(layoutForCard(card({ tone: 'attention' }), 'brief').emotion).toBe(
      'thoughtful',
    );
    expect(layoutForCard(card({ tone: 'concern' }), 'business').emotion).toBe(
      'sympathetic',
    );
    expect(layoutForCard(card({ demo: 'undo' }), 'product').emotion).toBe(
      'presenter',
    );
    expect(layoutForCard(card({ emotion: 'sleepy' }), 'brief').emotion).toBe(
      'sleepy',
    );
  });

  it('shows the magnifier only while searching for a name', () => {
    expect(layoutForCard(card({ demo: 'names' }), 'product').isSearching).toBe(
      true,
    );
    expect(layoutForCard(card({}), 'brief').isSearching).toBe(false);
  });

  it('pushes the number only on a neutral number-and-detail card', () => {
    const list = [{ name: 'D', initials: '09:00', detail: 'Haircut' }];
    expect(
      layoutForCard(
        card({ number: { value: 5, format: 'count' }, list }),
        'brief',
      ).hasNumberPush,
    ).toBe(true);
    expect(
      layoutForCard(
        card({
          tone: 'attention',
          number: { value: 1, format: 'count' },
          list,
        }),
        'brief',
      ).hasNumberPush,
    ).toBe(false);
  });

  it('has Clovie catch stars on delighted list cards and shows the NEW badge on product demos', () => {
    const rows = [
      { name: 'A', initials: 'A', detail: 'x' },
      { name: 'B', initials: 'B', detail: 'y' },
    ];
    expect(
      layoutForCard(card({ emotion: 'delighted', list: rows }), 'clients')
        .isCatching,
    ).toBe(true);
    expect(
      layoutForCard(card({ emotion: 'delighted' }), 'clients').isCatching,
    ).toBe(false);
    expect(layoutForCard(card({ demo: 'undo' }), 'product').hasBadge).toBe(
      true,
    );
    expect(layoutForCard(card({ list: rows }), 'product').hasBadge).toBe(false);
  });

  it('anchors right-hand placements to the right edge on other widths', () => {
    const p = { x: 290, y: 100, scale: 1, facing: 1 as const };
    expect(placeOnScreen(p, 402, 0).x).toBe(290);
    expect(placeOnScreen(p, 430, 12)).toEqual({
      x: 318,
      y: 112,
      scale: 1,
      facing: 1,
    });
    expect(placeOnScreen({ ...p, x: 114 }, 430, 0).x).toBe(114);
  });
});

describe('equaliser bars', () => {
  it('swings between 0.3 and 1 and never goes outside', () => {
    for (let t = 0; t < 4000; t += 130) {
      const s = barScale(t, 560, 300);
      expect(s).toBeGreaterThanOrEqual(0.3);
      expect(s).toBeLessThanOrEqual(1);
    }
    expect(barScale(0, 500, 0)).toBeCloseTo(0.3, 5);
    expect(barScale(500, 500, 0)).toBeCloseTo(1, 5);
  });
});
