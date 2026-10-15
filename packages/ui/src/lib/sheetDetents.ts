/**
 * Sheet detents (SwiftUI `.presentationDetents([.medium, .large])`): pure
 * geometry shared by `Sheet` and the companion sheet.
 */

/** `medium` rests at about half the screen, `large` fills it under the status bar. */
export type Detent = 'medium' | 'large';

/** The medium detent as a fraction of the usable height. */
export const MEDIUM_FRACTION = 0.58;

/**
 * Where a released drag settles. `offset` is how far the sheet's top has moved
 * from its current detent (positive = down), `velocity` is px/s (positive = down).
 * A fling or a long drag changes detent; a hard pull down from medium closes.
 */
export function settleDetent(opts: {
  from: Detent;
  offset: number;
  velocity: number;
  height: number;
}): Detent | 'close' {
  const { from, offset, velocity, height } = opts;
  const FLING = 800;
  const far = height * 0.12;
  const goDown = velocity > FLING || offset > far;
  const goUp = velocity < -FLING || offset < -far;
  if (from === 'large') return goDown ? 'medium' : 'large';
  if (goUp) return 'large';
  return goDown && (velocity > FLING * 1.5 || offset > height * 0.25)
    ? 'close'
    : 'medium';
}

/** Sheet height in px for a detent, given the usable height under the status bar. */
export function detentHeight(detent: Detent, usable: number): number {
  return detent === 'large' ? usable : Math.round(usable * MEDIUM_FRACTION);
}

/** The height a drag may reach: between a quarter of the screen and the large detent. */
export function clampSheetHeight(height: number, usable: number): number {
  return Math.min(Math.max(height, usable * 0.25), usable);
}
