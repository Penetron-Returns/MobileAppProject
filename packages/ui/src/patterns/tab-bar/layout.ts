/** Height of the tab row (TabFlatRaisedClovie.dc.html); the bar adds the bottom inset below it. */
export const TAB_BAR_HEIGHT = 64;
/** Diameter of the floating Inbox dome above the bar. */
export const INBOX_DOME_SIZE = 56;
/** Gap between the dome and the bar. */
export const INBOX_DOME_GAP = 12;
/** Breathing room kept between scrolling content and the bar. */
const CONTENT_GAP = 16;

/** Full height of the flat bar: the tab row plus the home-indicator inset it extends under. */
export function tabBarHeight(safeAreaBottom: number): number {
  return TAB_BAR_HEIGHT + Math.max(safeAreaBottom, 0);
}

/** Bottom padding (from the screen edge) scroll content needs so the bar never covers it. */
export function tabBarClearance(safeAreaBottom: number): number {
  return tabBarHeight(safeAreaBottom) + CONTENT_GAP;
}

/** Extra space for a screen whose last row sits under the floating Inbox dome. */
export const INBOX_DOME_CLEARANCE = INBOX_DOME_SIZE + INBOX_DOME_GAP;

/** Every route the bar can show as a tab. */
export type TabRouteName =
  'index' | 'calendar' | 'reports' | 'clients' | 'settings';

/** Free plan tabs, in display order; the centre "+" sits between the halves. */
export const DEFAULT_TABS: readonly TabRouteName[] = [
  'index',
  'calendar',
  'clients',
  'settings',
];

const TAB_ROOT_PATHS = new Set([
  '/',
  '/calendar',
  '/reports',
  '/clients',
  '/settings',
  '/inbox',
]);

/** True on the top-level tab screens, where the tab bar is visible. */
export function isTabRootPath(pathname: string): boolean {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return TAB_ROOT_PATHS.has(trimmed);
}
