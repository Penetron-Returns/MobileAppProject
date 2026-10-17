import type { DepthScheme } from '@booking/ui';

import { minutesToPx } from './logic';
import type { BlockTone } from './logic';
import type { MinuteSpan } from './spans';

/** Space left under a block so back-to-back bookings stay apart (Google leaves about 1-2px). */
export const BLOCK_GAP_PX = 2;
/** Space left on the right of a column so an empty spot stays tappable. */
export const BLOCK_RIGHT_MARGIN_PX = 6;
/** Very short bookings keep a tappable height instead of collapsing. */
export const MIN_BLOCK_PX = 16;
/** Corner radius of a booking or unavailable block: small, like Google's. */
export const BLOCK_RADIUS = 6;

export interface BlockFrame {
  top: number;
  height: number;
}

/**
 * Where a span sits in a column: its top on its start minute's pixel row and
 * its bottom on its end minute's, less the gap, so it stretches line to line.
 */
export function blockFrame(
  span: MinuteSpan,
  window: MinuteSpan,
  minHeight: number = MIN_BLOCK_PX,
): BlockFrame {
  return {
    top: minutesToPx(span.startMin - window.startMin),
    height: Math.max(
      minutesToPx(span.endMin - span.startMin) - BLOCK_GAP_PX,
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
