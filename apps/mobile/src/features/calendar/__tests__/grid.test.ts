import {
  BLOCK_FILLS,
  BLOCK_GAP_PX,
  BLOCK_TEXT,
  MIN_BLOCK_PX,
  blockFrame,
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
  ])('sits exactly on the minute rows (%s)', (_name, startMin, endMin) => {
    const frame = blockFrame({ startMin, endMin }, window);
    expect(frame.top).toBe(((startMin - window.startMin) / 60) * PX_PER_HOUR);
    expect(frame.top + frame.height).toBe(
      minutesToPx(endMin - window.startMin) - BLOCK_GAP_PX,
    );
  });

  it('keeps back-to-back bookings apart by the gap only', () => {
    const a = blockFrame({ startMin: 540, endMin: 600 }, window);
    const b = blockFrame({ startMin: 600, endMin: 660 }, window);
    expect(b.top - (a.top + a.height)).toBe(BLOCK_GAP_PX);
  });

  it('keeps a tappable minimum for a very short booking', () => {
    expect(blockFrame({ startMin: 540, endMin: 545 }, window).height).toBe(
      MIN_BLOCK_PX,
    );
  });
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
