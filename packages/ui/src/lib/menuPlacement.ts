export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MenuPlacement {
  top: number;
  left: number;
  /** The card sits above the anchor (it did not fit below). */
  above: boolean;
}

/** Gap between the anchor and the card. */
const GAP = 8;
/** Keeps the card off the screen edges. */
const MARGIN = 12;

/**
 * Where a menu card goes next to its anchor (the long-pressed row, or the
 * control of a pull-down): below it when it fits, above it when it does not,
 * and otherwise as low as the screen allows. Horizontally it lines up with the
 * anchor's trailing edge when the anchor is wider than the card, else it
 * starts at the anchor's leading edge; always kept inside the margins.
 * `align` picks which edge a narrow anchor shares with the card.
 */
export function placeMenu(opts: {
  anchor: Rect;
  menu: { width: number; height: number };
  screen: { width: number; height: number };
  insets: { top: number; bottom: number };
  align?: 'start' | 'end';
}): MenuPlacement {
  const { anchor, menu, screen, insets, align = 'start' } = opts;
  const minTop = insets.top + MARGIN;
  const maxBottom = screen.height - insets.bottom - MARGIN;
  const below = anchor.y + anchor.height + GAP;
  const fitsBelow = below + menu.height <= maxBottom;
  const aboveTop = anchor.y - GAP - menu.height;
  const fitsAbove = aboveTop >= minTop;
  const above = !fitsBelow && fitsAbove;
  const rawTop = above ? aboveTop : below;
  const top = Math.max(minTop, Math.min(rawTop, maxBottom - menu.height));

  const rawLeft =
    align === 'end' ? anchor.x + anchor.width - menu.width : anchor.x;
  const left = Math.max(
    MARGIN,
    Math.min(rawLeft, screen.width - MARGIN - menu.width),
  );
  return { top, left, above };
}

/** Estimated card height before it is measured: 48pt rows plus padding. */
export const MENU_ROW_HEIGHT = 48;
export const MENU_WIDTH = 250;

export function estimateMenuHeight(rows: number): number {
  return rows * MENU_ROW_HEIGHT + 8;
}
