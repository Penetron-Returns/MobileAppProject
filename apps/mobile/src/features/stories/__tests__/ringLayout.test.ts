import { RING_SIZE, storyLabelHeight, storyRingHeight } from '../ringLayout';

describe('story ring layout', () => {
  it.each([
    [1, 36],
    [0.8, 36],
    [1.15, 42],
    [1.3, 47],
    [2, 47],
  ])(
    'gives the label %s x font scale a height of %s pt (capped, never clipped)',
    (scale, height) => {
      expect(storyLabelHeight(scale)).toBe(height);
    },
  );

  it('reserves the ring, the gap and the label, so the skeleton and the real row match', () => {
    expect(storyRingHeight(1)).toBe(RING_SIZE + 6 + 36);
  });
});
