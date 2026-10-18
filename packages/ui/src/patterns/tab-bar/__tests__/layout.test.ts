import { LAYOUT } from '../../../tokens/spacing';
import {
  TAB_BAR_HEIGHT,
  isTabRootPath,
  tabBarHeight,
  tabBarClearance,
  TAB_ROW_PADDING_X,
  pillTranslateX,
} from '../layout';

describe('isTabRootPath', () => {
  it.each([
    '/',
    '/calendar',
    '/reports',
    '/clients',
    '/settings',
    '/inbox',
    '/clients/',
  ])('shows the bar on %s', (path) => expect(isTabRootPath(path)).toBe(true));

  it.each([
    '/new-booking',
    '/bookings/abc',
    '/clients/abc',
    '/settings/services',
    '/sign-in',
  ])('hides the bar on %s', (path) => expect(isTabRootPath(path)).toBe(false));
});

describe('tab bar height', () => {
  it('extends the tab row under the home indicator', () => {
    expect(tabBarHeight(34)).toBe(TAB_BAR_HEIGHT + 34);
  });

  it('is just the tab row where there is no inset', () => {
    expect(tabBarHeight(0)).toBe(TAB_BAR_HEIGHT);
  });

  it('clears the whole bar plus a gap for scrolling content', () => {
    expect(tabBarClearance(34)).toBe(TAB_BAR_HEIGHT + 34 + 16);
  });
});

describe('pill placement in the padded tab row', () => {
  const width = 390;
  const cell = (width - 2 * TAB_ROW_PADDING_X) / 4;

  it('pads the row by the screen gutter', () => {
    expect(TAB_ROW_PADDING_X).toBe(LAYOUT.screenPadding);
  });

  it('keeps the first pill a full gutter from the left edge', () => {
    const x = pillTranslateX({ x: TAB_ROW_PADDING_X, width: cell }, cell);
    expect(x).toBe(TAB_ROW_PADDING_X);
  });

  it('keeps the last pill a full gutter from the right edge', () => {
    const frame = { x: width - TAB_ROW_PADDING_X - cell, width: cell };
    expect(pillTranslateX(frame, cell) + cell).toBe(width - TAB_ROW_PADDING_X);
  });

  it('centres a pill under a cell whatever its base width', () => {
    expect(pillTranslateX({ x: 100, width: 80 }, 100)).toBe(90);
  });
});
