/** Frames per second from a frame count over an interval; 0 for an empty interval. */
export function framesPerSecond(frames: number, elapsedMs: number) {
  'worklet';
  return elapsedMs > 0 ? Math.round((frames * 1000) / elapsedMs) : 0;
}

/** The meter's one line of text. */
export function fpsLabel(ui: number, js: number) {
  'worklet';
  return `UI ${ui}  JS ${js}`;
}
