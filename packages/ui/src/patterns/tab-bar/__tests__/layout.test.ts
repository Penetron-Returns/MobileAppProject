import {
  TAB_BAR_HEIGHT,
  isTabRootPath,
  tabBarBottomOffset,
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

describe('tab bar offsets', () => {
  it('sits just above the home indicator on notched iPhones', () => {
    expect(tabBarBottomOffset(34)).toBe(32);
  });

  it('keeps a minimum margin where there is no inset', () => {
    expect(tabBarBottomOffset(0)).toBe(16);
  });

  it('clears the capsule plus a gap for scrolling content', () => {
    expect(tabBarClearance(34)).toBe(TAB_BAR_HEIGHT + 32 + 16);
  });
});
