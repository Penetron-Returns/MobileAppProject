import { PixelRatio } from 'react-native';
import type { DepthScheme } from '@booking/ui';

import { minutesToPx } from './logic';
import type { BlockTone } from './logic';
import type { MinuteSpan } from './spans';

/**
 * Inset on every side of a cell and of a block, so neighbours sit 2px apart.
 * The gap shows the page ground and is the grid: no lines are drawn. Rounded
 * to a physical pixel so the edges stay crisp.
 */
export const BLOCK_INSET_PX = PixelRatio.roundToNearestPixel(1);
/** Very short bookings keep a tappable height instead of collapsing. */
export const MIN_BLOCK_PX = 16;
/** Corner radius of an empty cell, a booking, a break or time off. */
export const BLOCK_RADIUS = 4;

/** Fill of an empty hour cell: a step off the page ground. */
export const GRID_CELL: Record<DepthScheme, string> = {
  light: '#EDEDF2',
  dark: '#1C1C1E',
};

export interface BlockFrame {
  top: number;
  height: number;
}

const frameCache = new Map<string, BlockFrame[]>();

/**
 * One empty cell per hour of the window (the last may be shorter), inset on all
 * sides. Every column of a day shares one window, so the frames are computed
 * once and reused (callers must not mutate them).
 */
export function cellFrames(window: MinuteSpan): BlockFrame[] {
  const key = `${window.startMin}-${window.endMin}`;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const frames: BlockFrame[] = [];
  for (let m = window.startMin; m < window.endMin; m += 60) {
    const end = Math.min(m + 60, window.endMin);
    frames.push({
      top: minutesToPx(m - window.startMin) + BLOCK_INSET_PX,
      height: minutesToPx(end - m) - 2 * BLOCK_INSET_PX,
    });
  }
  if (frameCache.size > 16) frameCache.clear();
  frameCache.set(key, frames);
  return frames;
}

/** Horizontal placement inside a column: inset from both column edges. */
export function blockHorizontal(columnWidth: number): {
  left: number;
  width: number;
} {
  return { left: BLOCK_INSET_PX, width: columnWidth - 2 * BLOCK_INSET_PX };
}

/**
 * Where a span sits in a column: its top at its start minute and its bottom
 * at its end minute, each inset, so it covers its cells exactly.
 */
export function blockFrame(
  span: MinuteSpan,
  window: MinuteSpan,
  minHeight: number = MIN_BLOCK_PX,
): BlockFrame {
  return {
    top: minutesToPx(span.startMin - window.startMin) + BLOCK_INSET_PX,
    height: Math.max(
      minutesToPx(span.endMin - span.startMin) - 2 * BLOCK_INSET_PX,
      minHeight,
    ),
  };
}

/** Opaque fills that carry white text at WCAG AA (4.5:1) in each scheme. */
export const BLOCK_FILLS: Record<DepthScheme, Record<BlockTone, string>> = {
  light: {
    upcoming: '#0A64D6',
    arrived: '#177A33',
    noShow: '#9A5A00',
    done: '#636366',
  },
  dark: {
    upcoming: '#1F6FE0',
    arrived: '#1F8239',
    noShow: '#A85F00',
    done: '#6E6E73',
  },
};

export const BLOCK_TEXT = '#FFFFFF';

export function blockFill(tone: BlockTone, scheme: DepthScheme): string {
  return BLOCK_FILLS[scheme][tone];
}

/** WCAG 2.x contrast ratio of two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Smallest comfortable touch target (HIG): shorter blocks grow their hit area, not their look. */
export const MIN_TOUCH_PX = 44;

export function blockHitSlop(
  height: number,
): { top: number; bottom: number } | undefined {
  const extra = Math.ceil((MIN_TOUCH_PX - height) / 2);
  return extra > 0 ? { top: extra, bottom: extra } : undefined;
}

/** How far above the focus line (now, or the first working hour) the grid opens, so it is not flush with the top. */
const FOCUS_LEAD_PX = 120;

/** Vertical offset the day grid opens at: the focus minute near the top, or the very top without one. */
export function focusScrollY(
  focusMin: number | undefined,
  window: MinuteSpan,
): number {
  if (focusMin === undefined) return 0;
  return Math.max(minutesToPx(focusMin - window.startMin) - FOCUS_LEAD_PX, 0);
}
