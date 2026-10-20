/**
 * How the boards' Clovie "reactions" (tilt, hop, wave, breathe) map onto the
 * one existing character: plain transforms of the whole figure, no redrawing.
 * Pure, so each pose is table-testable; `poseAt` is a worklet that the
 * animated style calls on the UI thread.
 */
export type ClovieMood =
  | 'excited'
  | 'proud'
  | 'delighted'
  | 'curious'
  | 'thoughtful'
  | 'sympathetic'
  | 'calm';

/** A figure pose: degrees, scale and a vertical lift in pt (negative is up). */
export interface Pose {
  rotate: number;
  scale: number;
  y: number;
}

/** The held pose when nothing moves (and under Reduce Motion). */
export const REST: Record<ClovieMood, Pose> = {
  excited: { rotate: 0, scale: 1, y: 0 },
  proud: { rotate: 0, scale: 1.08, y: 0 },
  delighted: { rotate: 0, scale: 1.05, y: 0 },
  curious: { rotate: -7, scale: 1, y: 0 },
  thoughtful: { rotate: -11, scale: 1, y: 0 },
  sympathetic: { rotate: 7, scale: 0.9, y: 0 },
  calm: { rotate: 0, scale: 1, y: 0 },
};

export interface LoopSpec {
  periodMs: number;
  /** -1 loops forever; 1 plays once. */
  repeat: number;
}

/** The boards' loops: the wave, the hops, the slow float and the breath. Sympathetic holds still. */
export const LOOPS: Record<ClovieMood, LoopSpec | null> = {
  excited: { periodMs: 1400, repeat: -1 },
  proud: { periodMs: 2800, repeat: -1 },
  // The Name board: "Clovie hops once".
  delighted: { periodMs: 1900, repeat: 1 },
  curious: { periodMs: 3200, repeat: -1 },
  thoughtful: { periodMs: 4200, repeat: -1 },
  sympathetic: null,
  calm: { periodMs: 3000, repeat: -1 },
};

const HOP_PT = 9;
const HOP_SHARE = 0.45;
const FLOAT_PT = 2;
const BREATH = 0.05;
const WAVE_DEG = 4.5;

/** The pose at phase `p` (0 to 1) of the mood's loop. */
export function poseAt(mood: ClovieMood, p: number): Pose {
  'worklet';
  const base = REST[mood];
  const wave = Math.sin(2 * Math.PI * p);
  const swell = 0.5 - 0.5 * Math.cos(2 * Math.PI * p);
  switch (mood) {
    case 'excited':
      return { ...base, rotate: 0.5 + WAVE_DEG * wave };
    case 'proud':
    case 'delighted':
      return {
        ...base,
        y: p < HOP_SHARE ? -HOP_PT * Math.sin((Math.PI * p) / HOP_SHARE) : 0,
      };
    case 'curious':
    case 'thoughtful':
      return { ...base, y: -FLOAT_PT * swell };
    case 'calm':
      return { ...base, scale: 1 + BREATH * swell };
    default:
      return base;
  }
}
