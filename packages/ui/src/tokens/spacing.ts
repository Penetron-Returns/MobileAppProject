/** 4/8 spacing grid, in points. */
export const SPACING = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
} as const;

/** Layout constants from Foundations. */
export const LAYOUT = {
  /** Screen side padding. */
  screenPadding: SPACING[5],
  /** Space between sections. */
  sectionGap: SPACING[7],
  /** Two-line row, minimum height. */
  rowMinHeight: SPACING[14],
  /** Primary row and button height. */
  primaryRowHeight: SPACING[14],
  /** Smallest tap target (accessibility rule). */
  tapTarget: 44,
  /** Content column cap on wide screens (tablet, web). */
  maxContentWidth: 672,
} as const;
