/** Stacking order. Overlays always sit above the tab bar, toasts above overlays. */
export const Z_INDEX = {
  base: 0,
  /** Pinned footers and fades. */
  pinned: 10,
  /** Floating tab bar and Inbox dome. */
  tabBar: 30,
  /** Sheets, dialogs, menus. */
  overlay: 40,
  /** Toasts. */
  toast: 50,
} as const;
