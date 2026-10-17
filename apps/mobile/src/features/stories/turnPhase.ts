/**
 * Faces and progress bars are driven by monotonic shared values that are never
 * reset. Face `turnId` (the number of transitions committed so far) says where
 * a face sits on the `turn` timeline: a transition `n` animates `turn` from
 * `n - 1` to `n`. Because nothing is ever set back to 0, the old card cannot
 * flash back at full strength between the UI-thread animation and the JS state
 * commit: until the new faces are committed, `turn` still reads `n - 1` and the
 * old face is exactly where it was.
 */
export function turnPhase(turn: number, turnId: number): number {
  'worklet';
  const p = turn - (turnId - 1);
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** Fill of the current segment: `progress` runs from `serial` to `serial + 1` over a card. */
export function cardFill(progress: number, cardSerial: number): number {
  'worklet';
  const p = progress - cardSerial;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

export type Role = 'in' | 'out';

/** Opacity of a face on the slide / crossfade path. */
export function faceOpacity(role: Role, phase: number): number {
  'worklet';
  return role === 'in' ? phase : 1 - phase;
}
