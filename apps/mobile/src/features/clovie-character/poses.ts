import { compileFrames, type CompiledFrames, type Frame } from './keyframes';

export const EMOTIONS = [
  'delighted',
  'proud',
  'curious',
  'thoughtful',
  'sympathetic',
  'presenter',
  'sleepy',
  'calm',
] as const;
export type ClovieEmotion = (typeof EMOTIONS)[number];

export type PropKind =
  | 'sparkle1'
  | 'sparkle2'
  | 'sparkle3'
  | 'sign'
  | 'lens'
  | 'heart'
  | 'question'
  | 'drop'
  | 'stars'
  | 'z'
  | 'moon';

export interface PoseBase {
  /** Uniform scale held at rest. */
  scale: number;
  /** Degrees held at rest. */
  rotate: number;
  /** Points held at rest. */
  tx: number;
}

export interface PoseDef {
  base: PoseBase;
  /** One loop in ms; 0 means the pose has no loop. */
  loopMs: number;
  frames: Frame[];
  /** Sleepy dims the image to 74% and desaturates it. */
  isDimmed: boolean;
  /** Resting eyelid scaleY (sleepy eyes sit half shut). */
  lidRest: number;
}

const NO_BASE: PoseBase = { scale: 1, rotate: 0, tx: 0 };

const POSES: Record<ClovieEmotion, PoseDef> = {
  delighted: {
    base: { ...NO_BASE, scale: 1.05 },
    loopMs: 1900,
    frames: [
      { at: 0, ty: 0, sx: 1, sy: 1 },
      { at: 0.12, ty: 0, sx: 1.1, sy: 0.88 },
      { at: 0.3, ty: -26, sx: 0.92, sy: 1.14 },
      { at: 0.5, ty: 0, sx: 1.08, sy: 0.9 },
      { at: 0.6, ty: 0, sx: 0.98, sy: 1.03 },
      { at: 0.72, ty: -9, sx: 0.97, sy: 1.05 },
      { at: 0.84, ty: 0, sx: 1.04, sy: 0.95 },
      { at: 1, ty: 0, sx: 1, sy: 1 },
    ],
    isDimmed: false,
    lidRest: 0,
  },
  proud: {
    base: { ...NO_BASE, scale: 1.08 },
    loopMs: 2800,
    frames: [
      { at: 0, ty: 0, sx: 1, sy: 1 },
      { at: 0.2, ty: 0, sx: 1.1, sy: 1.08 },
      { at: 0.45, ty: 0, sx: 1.1, sy: 1.08 },
      { at: 0.6, ty: -7, sx: 1.04, sy: 1.1 },
      { at: 0.72, ty: 0, sx: 1.1, sy: 1.04 },
      { at: 1, ty: 0, sx: 1, sy: 1 },
    ],
    isDimmed: false,
    lidRest: 0,
  },
  curious: {
    base: { ...NO_BASE, rotate: -7, tx: -3 },
    loopMs: 3200,
    frames: [
      { at: 0, rot: 0, ty: 0 },
      { at: 0.35, rot: -3, ty: -2 },
      { at: 0.65, rot: 1, ty: 0 },
      { at: 1, rot: 0, ty: 0 },
    ],
    isDimmed: false,
    lidRest: 0,
  },
  thoughtful: {
    base: { ...NO_BASE, rotate: -11 },
    loopMs: 4200,
    frames: [
      { at: 0, rot: 0, tx: 0 },
      { at: 0.22, rot: -12, tx: -3 },
      { at: 0.66, rot: -12, tx: -3 },
      { at: 0.8, rot: -1, tx: 0 },
      { at: 1, rot: 0, tx: 0 },
    ],
    isDimmed: false,
    lidRest: 0,
  },
  sympathetic: {
    base: { scale: 0.9, rotate: 7, tx: 4 },
    loopMs: 4800,
    frames: [
      { at: 0, rot: 0, tx: 0 },
      { at: 0.4, rot: 3, tx: 3 },
      { at: 0.68, rot: 3, tx: 3 },
      { at: 1, rot: 0, tx: 0 },
    ],
    isDimmed: false,
    lidRest: 0,
  },
  presenter: {
    base: { ...NO_BASE, rotate: 4 },
    loopMs: 1400,
    frames: [
      { at: 0, rot: 0, ty: 0 },
      { at: 0.25, rot: 7, ty: -6 },
      { at: 0.5, rot: -6, ty: 0 },
      { at: 0.75, rot: 7, ty: -6 },
      { at: 1, rot: 0, ty: 0 },
    ],
    isDimmed: false,
    lidRest: 0,
  },
  sleepy: {
    base: { ...NO_BASE, scale: 0.96 },
    loopMs: 5000,
    frames: [
      { at: 0, sx: 1, sy: 1 },
      { at: 0.5, sx: 1.03, sy: 1.05, ty: 1 },
      { at: 1, sx: 1, sy: 1 },
    ],
    isDimmed: true,
    lidRest: 0.5,
  },
  calm: { base: NO_BASE, loopMs: 0, frames: [], isDimmed: false, lidRest: 0 },
};

export function poseFor(emotion: ClovieEmotion): PoseDef {
  return POSES[emotion];
}

const COMPILED = {} as Record<ClovieEmotion, CompiledFrames>;
for (const e of EMOTIONS) COMPILED[e] = compileFrames(POSES[e].frames);
export function compiledPose(emotion: ClovieEmotion): CompiledFrames {
  return COMPILED[emotion];
}

export interface PropOptions {
  /** Curious only: the magnifier shows while he is looking for something. */
  isSearching?: boolean;
  /** Delighted only: stars fall into his hands (feedback cards). */
  isCatching?: boolean;
}

/** Which prop shapes an emotion shows. Pure; the shapes live in ClovieProps. */
export function propsFor(
  emotion: ClovieEmotion,
  options: PropOptions = {},
): PropKind[] {
  switch (emotion) {
    case 'delighted':
      return options.isCatching
        ? ['sparkle1', 'sparkle2', 'sparkle3', 'stars']
        : ['sparkle1', 'sparkle2', 'sparkle3'];
    case 'proud':
      return ['sparkle1', 'sparkle3', 'heart'];
    case 'curious':
      return options.isSearching ? ['lens'] : [];
    case 'thoughtful':
      return ['question', 'drop'];
    case 'sympathetic':
      return ['heart'];
    case 'presenter':
      return ['sparkle2', 'sign'];
    case 'sleepy':
      return ['z', 'moon'];
    case 'calm':
      return [];
  }
}

export interface PoseTransform {
  tx: number;
  ty: number;
  rot: number;
  sx: number;
  sy: number;
}

/** Loop sample on top of the resting base, as the CSS `scale`/`rotate` + `transform` compose. */
export function composePose(
  base: PoseBase,
  loop: PoseTransform,
): PoseTransform {
  'worklet';
  return {
    tx: base.tx + loop.tx,
    ty: loop.ty,
    rot: base.rotate + loop.rot,
    sx: base.scale * loop.sx,
    sy: base.scale * loop.sy,
  };
}
