/**
 * Keyframe sampling for the character's loops. The design is written as CSS
 * keyframes (percent stops, ease-in-out between them); this is the same thing
 * as plain data plus one worklet, so a single shared value 0..1 drives a whole
 * loop on the UI thread. Pure, so it is unit tested.
 */
export type FrameKey = 'tx' | 'ty' | 'rot' | 'sx' | 'sy' | 'op';
export type Frame = { at: number } & Partial<Record<FrameKey, number>>;
export type Sampled = Record<FrameKey, number>;

type Track = { at: number[]; v: number[] };
export type CompiledFrames = {
  tracks: Record<FrameKey, Track>;
  isLinear: boolean;
};

export const IDENTITY: Sampled = { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1, op: 1 };
const KEYS: FrameKey[] = ['tx', 'ty', 'rot', 'sx', 'sy', 'op'];

/** Like CSS, a property only interpolates between the stops that name it. */
export function compileFrames(
  frames: Frame[],
  options: { isLinear?: boolean } = {},
): CompiledFrames {
  const tracks = {} as Record<FrameKey, Track>;
  for (const key of KEYS) {
    const stops = frames.filter((f) => f[key] !== undefined);
    tracks[key] =
      stops.length === 0
        ? { at: [0], v: [IDENTITY[key]] }
        : {
            at: stops.map((f) => f.at),
            v: stops.map((f) => f[key] as number),
          };
  }
  return { tracks, isLinear: options.isLinear === true };
}

function sampleTrack(track: Track, t: number, isLinear: boolean): number {
  'worklet';
  const { at, v } = track;
  const last = at.length - 1;
  if (t <= at[0]) return v[0];
  if (t >= at[last]) return v[last];
  let i = 0;
  while (i < last - 1 && t > at[i + 1]) i += 1;
  const span = at[i + 1] - at[i];
  const u = span === 0 ? 1 : (t - at[i]) / span;
  const e = isLinear ? u : u * u * (3 - 2 * u);
  return v[i] + (v[i + 1] - v[i]) * e;
}

export function sampleFrames(compiled: CompiledFrames, t: number): Sampled {
  'worklet';
  const { tracks, isLinear } = compiled;
  return {
    tx: sampleTrack(tracks.tx, t, isLinear),
    ty: sampleTrack(tracks.ty, t, isLinear),
    rot: sampleTrack(tracks.rot, t, isLinear),
    sx: sampleTrack(tracks.sx, t, isLinear),
    sy: sampleTrack(tracks.sy, t, isLinear),
    op: sampleTrack(tracks.op, t, isLinear),
  };
}
