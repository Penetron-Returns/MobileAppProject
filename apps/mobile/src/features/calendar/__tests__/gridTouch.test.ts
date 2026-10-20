import { blockHitSlop, cellFrames, focusScrollY, MIN_TOUCH_PX } from '../grid';
import { appointmentsOnDate, PX_PER_HOUR } from '../logic';

describe('blockHitSlop', () => {
  it.each([
    ['a tall block needs none', 96, undefined],
    ['exactly 44 needs none', MIN_TOUCH_PX, undefined],
    ['a 16pt block grows 14pt each way', 16, { top: 14, bottom: 14 }],
    ['an odd gap rounds up', 21, { top: 12, bottom: 12 }],
  ])('%s', (_name, height, expected) => {
    expect(blockHitSlop(height)).toEqual(expected);
  });
});

describe('focusScrollY', () => {
  const window = { startMin: 8 * 60, endMin: 18 * 60 };
  it.each([
    ['no focus opens at the top', undefined, 0],
    ['a focus near the top does not scroll', 8 * 60 + 30, 0],
    ['a later focus sits 120px below the top', 12 * 60, PX_PER_HOUR * 4 - 120],
  ])('%s', (_name, focus, expected) => {
    expect(focusScrollY(focus, window)).toBe(expected);
  });
});

describe('cellFrames', () => {
  it('returns the same frames for the same window', () => {
    const window = { startMin: 480, endMin: 1080 };
    expect(cellFrames(window)).toBe(cellFrames({ ...window }));
    expect(cellFrames(window)).toHaveLength(10);
  });
});

describe('appointmentsOnDate', () => {
  const rows = [
    { id: 'a', starts_at: '2026-10-14T08:00:00Z' },
    // 23:30 UTC is 01:30 on the 15th in Johannesburg (UTC+2).
    { id: 'b', starts_at: '2026-10-14T23:30:00Z' },
    { id: 'c', starts_at: '2026-10-16T08:00:00Z' },
  ];
  it('keeps only the rows starting that business day', () => {
    expect(
      appointmentsOnDate(rows, '2026-10-14', 'Africa/Johannesburg').map(
        (r) => r.id,
      ),
    ).toEqual(['a']);
    expect(
      appointmentsOnDate(rows, '2026-10-15', 'Africa/Johannesburg').map(
        (r) => r.id,
      ),
    ).toEqual(['b']);
  });
  it('is empty for a day with nothing', () => {
    expect(appointmentsOnDate(rows, '2026-10-17', 'UTC')).toEqual([]);
  });
});
