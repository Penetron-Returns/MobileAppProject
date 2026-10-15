import { clampSheetHeight, detentHeight, settleDetent } from '../sheetDetents';

describe('settleDetent', () => {
  const height = 800;
  it.each([
    ['medium, small drag stays', 'medium', 10, 0, 'medium'],
    ['medium, drag up goes large', 'medium', -150, 0, 'large'],
    ['medium, fling up goes large', 'medium', -20, -1200, 'large'],
    ['medium, long drag down closes', 'medium', 250, 0, 'close'],
    ['medium, hard fling down closes', 'medium', 30, 1500, 'close'],
    ['medium, short pull down stays', 'medium', 120, 0, 'medium'],
    ['large, small drag stays', 'large', 20, 0, 'large'],
    ['large, drag down goes medium', 'large', 150, 0, 'medium'],
    ['large, fling down goes medium', 'large', 10, 1000, 'medium'],
  ] as const)('%s', (_n, from, offset, velocity, expected) => {
    expect(settleDetent({ from, offset, velocity, height })).toBe(expected);
  });
});

describe('detentHeight', () => {
  it('is the usable height at large and a fraction at medium', () => {
    expect(detentHeight('large', 800)).toBe(800);
    expect(detentHeight('medium', 800)).toBe(464);
  });
});

describe('clampSheetHeight', () => {
  it.each([
    [100, 200],
    [500, 500],
    [900, 800],
  ])('keeps a dragged height of %i within bounds (%i)', (value, expected) => {
    expect(clampSheetHeight(value, 800)).toBe(expected);
  });
});
