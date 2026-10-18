import {
  TAB_BAR_HEIGHT,
  isTabRootPath,
  tabBarHeight,
  tabBarClearance,
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
