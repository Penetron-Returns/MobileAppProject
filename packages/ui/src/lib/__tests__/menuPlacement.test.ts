import { estimateMenuHeight, placeMenu } from '../menuPlacement';

const screen = { width: 400, height: 800 };
const insets = { top: 50, bottom: 34 };
const menu = { width: 250, height: 200 };

describe('placeMenu', () => {
  it('opens below an anchor with room under it', () => {
    const p = placeMenu({
      anchor: { x: 20, y: 200, width: 360, height: 60 },
      menu,
      screen,
      insets,
    });
    expect(p).toEqual({ top: 268, left: 20, above: false });
  });

  it('opens above when the anchor is near the bottom', () => {
    const p = placeMenu({
      anchor: { x: 20, y: 650, width: 360, height: 60 },
      menu,
      screen,
      insets,
    });
    expect(p.above).toBe(true);
    expect(p.top).toBe(442);
  });

  it('lines up with the trailing edge for align end', () => {
    const p = placeMenu({
      anchor: { x: 300, y: 100, width: 80, height: 40 },
      menu,
      screen,
      insets,
      align: 'end',
    });
    expect(p.left).toBe(130);
  });

  it('keeps the card inside the screen margins', () => {
    const p = placeMenu({
      anchor: { x: 350, y: 100, width: 40, height: 40 },
      menu,
      screen,
      insets,
    });
    expect(p.left).toBe(138);
  });

  it('settles at the lowest spot when it fits neither way', () => {
    const p = placeMenu({
      anchor: { x: 20, y: 300, width: 360, height: 300 },
      menu: { width: 250, height: 420 },
      screen,
      insets,
    });
    expect(p.top).toBe(800 - 34 - 12 - 420);
  });
});

describe('estimateMenuHeight', () => {
  it('grows by one row per action', () => {
    expect(estimateMenuHeight(4) - estimateMenuHeight(3)).toBe(48);
  });
});
