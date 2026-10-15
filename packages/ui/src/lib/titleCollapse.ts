/**
 * SwiftUI `.navigationBarTitleDisplayMode(.large)` maths: how the inline title
 * bar fades in as the large title scrolls under it, and how the large title
 * stretches when the list is pulled down. Pure, so it runs inside a Reanimated
 * worklet and under test.
 */

/** Points of scrolling over which the inline title and its bar fade in. */
export const COLLAPSE_FADE = 16;
/** Largest stretch of the large title on overscroll (12%). */
export const OVERSCROLL_SCALE_MAX = 0.12;
/** Pull distance at which the stretch reaches its maximum. */
export const OVERSCROLL_RANGE = 240;

/**
 * The scroll offset at which the large title's bottom edge reaches the bottom
 * of the bar. `titleBottom` is measured in content coordinates at rest.
 */
export function collapseThreshold(
  titleBottom: number,
  barBottom: number,
): number {
  'worklet';
  return Math.max(0, titleBottom - barBottom);
}

export interface TitleCollapse {
  /** 0 (large title only) to 1 (inline title in a full material bar). */
  barOpacity: number;
  /** Scale of the large title: above 1 while pulled down, otherwise 1. */
  titleScale: number;
}

/** Bar opacity and large-title scale for a scroll offset. */
export function titleCollapse(
  offset: number,
  threshold: number,
  reduceMotion: boolean,
): TitleCollapse {
  'worklet';
  if (reduceMotion) {
    return { barOpacity: offset >= threshold ? 1 : 0, titleScale: 1 };
  }
  const progress = (offset - threshold) / COLLAPSE_FADE;
  const barOpacity = Math.min(1, Math.max(0, progress));
  const pull = Math.min(1, Math.max(0, -offset) / OVERSCROLL_RANGE);
  return { barOpacity, titleScale: 1 + pull * OVERSCROLL_SCALE_MAX };
}
