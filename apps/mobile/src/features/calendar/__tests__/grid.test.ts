import {
  BLOCK_FILLS,
  BLOCK_INSET_PX,
  BLOCK_RADIUS,
  BLOCK_TEXT,
  MIN_BLOCK_PX,
  blockFrame,
  blockHorizontal,
  cellFrames,
  contrastRatio,
} from '../grid';
import { PX_PER_HOUR, minutesToPx } from '../logic';

const window = { startMin: 8 * 60, endMin: 18 * 60 };

describe('blockFrame', () => {
  it.each([
    ['on the first hour', 8 * 60, 9 * 60],
    ['half past, 30 minutes', 9 * 60 + 30, 10 * 60],
    ['quarter hour, 45 minutes', 11 * 60 + 15, 12 * 60],
    ['long, 3 hours', 12 * 60, 15 * 60],
  ])('insets both ends from its minutes (%s)', (_name, startMin, endMin) => {
    const frame = blockFrame({ startMin, endMin }, window);
    const startPx = ((startMin - window.startMin) / 60) * PX_PER_HOUR;
    const endPx = minutesToPx(endMin - window.startMin);
    expect(frame.top).toBe(startPx + BLOCK_INSET_PX);
    expect(frame.height).toBe(endPx - startPx - 2 * BLOCK_INSET_PX);
    expect(frame.top + frame.height).toBe(endPx - BLOCK_INSET_PX);
  });

  it('separates back-to-back bookings by twice the inset', () => {
    const a = blockFrame({ startMin: 540, endMin: 600 }, window);
    const b = blockFrame({ startMin: 600, endMin: 660 }, window);
    expect(b.top - (a.top + a.height)).toBe(2 * BLOCK_INSET_PX);
  });

  it('keeps a tappable minimum for a very short booking', () => {
    expect(blockFrame({ startMin: 540, endMin: 545 }, window).height).toBe(
      MIN_BLOCK_PX,
    );
  });
});

describe('cellFrames', () => {
  it('makes one cell per hour, 2px apart, matching a full-hour block', () => {
    const cells = cellFrames(window);
    expect(cells).toHaveLength(10);
    cells.slice(1).forEach((cell, i) => {
      expect(cell.top - (cells[i].top + cells[i].height)).toBe(
        2 * BLOCK_INSET_PX,
      );
    });
    expect(cells[2]).toEqual(
      blockFrame({ startMin: 600, endMin: 660 }, window),
    );
  });

  it('shortens the last cell when the window ends mid-hour', () => {
    const cells = cellFrames({ startMin: 480, endMin: 570 });
    expect(cells).toHaveLength(2);
    expect(cells[1].height).toBe(minutesToPx(30) - 2 * BLOCK_INSET_PX);
  });

  it('returns nothing for an empty window', () => {
    expect(cellFrames({ startMin: 480, endMin: 480 })).toEqual([]);
  });
});

describe('blockHorizontal', () => {
  it.each([100, 187.5, 360])(
    'insets both sides equally in a %s wide column',
    (w) => {
      const { left, width } = blockHorizontal(w);
      expect(left).toBe(BLOCK_INSET_PX);
      expect(w - (left + width)).toBe(left);
    },
  );
});

it('draws slightly round corners and 2px gaps', () => {
  expect(BLOCK_RADIUS).toBe(4);
  expect(2 * BLOCK_INSET_PX).toBe(2);
});

describe('BLOCK_FILLS', () => {
  const cases = Object.entries(BLOCK_FILLS).flatMap(([scheme, tones]) =>
    Object.entries(tones).map(([tone, fill]) => [scheme, tone, fill] as const),
  );
  it.each(cases)(
    '%s %s is opaque and carries white text at AA',
    (_s, _t, fill) => {
      expect(fill).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastRatio(fill, BLOCK_TEXT)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
