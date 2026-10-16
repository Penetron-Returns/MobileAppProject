import type { DepthTokens } from '@booking/ui';
import type { ViewStyle } from 'react-native';

/**
 * The in-app voice drawer's colours. Everything the Depth system already has (raised and hero cards, buttons, the
 * inset chip, the tint, the primary and its pressed state, the sheet shadow, the grabber) is read from `useDepth()`.
 * What is left is the board's own Clovie-blue voice palette (VoiceInAppScreen: the glow, bars, rings and halo), which
 * no other screen uses, so its hex values live here once. Light and dark are the board's `t`.
 */
export interface VoiceTokens {
  /** The drawer's fill: a step above `raised`, so the approval card (raised) still reads as a card on it. */
  drawer: Pick<ViewStyle, 'backgroundColor' | 'experimental_backgroundImage'>;
  /** The dim over the screen behind the drawer. */
  dim: string;
  /** "Listening…" and the caret. */
  accent: string;
  haloColor: string;
  ringColor: string;
  /** The waveform bar gradient, top to bottom. */
  barImage: string;
  /** The glow blobs' colours, in order, and their opacity. */
  blobColors: readonly [string, string, string, string, string];
  blobOpacity: number;
  /** `screen` blends the glow into the dark ground; light is plain alpha. */
  blend: ViewStyle['mixBlendMode'];
  /** The line that travels along the bottom edge while thinking. */
  beamImage: string;
  /** Lip under the grabber: its light edge. */
  grabLip: string;
}

const gradient = (top: string, bottom: string) =>
  `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;

const LIGHT: VoiceTokens = {
  drawer: {
    backgroundColor: '#FFFFFF',
    experimental_backgroundImage: gradient('#FFFFFF', '#F8F8FB'),
  },
  dim: 'rgba(0,0,0,0.4)',
  accent: '#0A5F8F',
  haloColor: 'rgba(42,161,214,0.4)',
  ringColor: 'rgba(16,120,175,0.3)',
  barImage: gradient('#2AA1D6', '#1078AF'),
  blobColors: ['#1078AF', '#2AA1D6', '#7CC6EA', '#5ECFC9', '#1078AF'],
  blobOpacity: 0.55,
  blend: 'normal',
  beamImage:
    'linear-gradient(90deg, rgba(42,161,214,0), #2AA1D6 30%, #1078AF 70%, rgba(16,120,175,0))',
  grabLip: 'rgba(255,255,255,0.6)',
};

const DARK: VoiceTokens = {
  drawer: {
    backgroundColor: '#24252C',
    experimental_backgroundImage: gradient('#24252C', '#1C1D23'),
  },
  dim: 'rgba(0,0,0,0.4)',
  accent: '#9DD9F5',
  haloColor: 'rgba(42,161,214,0.5)',
  ringColor: 'rgba(42,161,214,0.4)',
  barImage: gradient('#9DD9F5', '#2AA1D6'),
  blobColors: ['#1078AF', '#2AA1D6', '#9DD9F5', '#5ECFC9', '#1078AF'],
  blobOpacity: 0.9,
  blend: 'screen',
  beamImage:
    'linear-gradient(90deg, rgba(157,217,245,0), #9DD9F5 30%, #5ECFC9 70%, rgba(94,207,201,0))',
  grabLip: 'rgba(255,255,255,0.06)',
};

export function voiceTokens(depth: Pick<DepthTokens, 'scheme'>): VoiceTokens {
  return depth.scheme === 'dark' ? DARK : LIGHT;
}

/** The soft Clovie-blue fade-out used by the halo, rings and blobs (transparent at the edge). */
export const radialFade = (color: string) =>
  `radial-gradient(closest-side, ${color}, rgba(42,161,214,0) 100%)`;

/** The thinking orb (the board's gradient, the same in both schemes). */
export const ORB_IMAGE =
  'radial-gradient(circle at 35% 30%, #C7D2FE 0%, #818CF8 55%, #38BDF8 100%)';

/** The glow blobs of the board, placed for its 402 pt screen (scaled to the real width). */
export const BLOBS = [
  { left: -60, width: 220, color: 0, d: 3.6, dl: 0, dx: 14, dd: 9 },
  { left: 50, width: 240, color: 1, d: 4.2, dl: -1.2, dx: 18, dd: 7 },
  { left: 140, width: 200, color: 2, d: 3.2, dl: -0.6, dx: 12, dd: 8 },
  { left: 220, width: 240, color: 3, d: 4.6, dl: -2, dx: 16, dd: 10 },
  { left: 290, width: 200, color: 4, d: 3.9, dl: -1.5, dx: 14, dd: 8 },
] as const;

export const BOARD_WIDTH = 402;
