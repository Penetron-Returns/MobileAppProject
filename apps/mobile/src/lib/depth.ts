import type { ViewStyle } from 'react-native';

/**
 * Depth tokens: the layered shadows and gradients of the approved iPhone
 * designs (Main.dc.html's theme object `t`), which NativeWind classes cannot
 * express. React Native 0.86 accepts CSS-style `boxShadow` strings (including
 * `inset`) and `experimental_backgroundImage` gradients, so the values are the
 * design's own. `backgroundColor` is the gradient's top colour and is the
 * fallback where gradients are unsupported (web, tests).
 *
 * Light comes from the top: raised surfaces are lighter at the top edge with a
 * 1px highlight and a soft layered shadow below; pressed things are inset.
 */
export type DepthScheme = 'light' | 'dark';

export const SYSTEM_TINT = { light: '#007AFF', dark: '#0A84FF' } as const;

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  let h = hex.trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) {
    h = h
      .split('')
      .map((x) => x + x)
      .join('');
  }
  // Anything that is not a hex colour falls back to the system blue.
  if (!/^[0-9a-f]{6}$/i.test(h)) h = '007AFF';
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;
}

function mix(hex: string, target: number, amount: number): string {
  return toHex(parseHex(hex).map((v) => v + (target - v) * amount) as Rgb);
}

export const lighten = (hex: string, amount: number) => mix(hex, 255, amount);
export const darken = (hex: string, amount: number) => mix(hex, 0, amount);

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A gradient-filled surface: the gradient plus its solid fallback and shadow. */
type SurfaceStyle = Pick<
  ViewStyle,
  'backgroundColor' | 'experimental_backgroundImage' | 'boxShadow'
>;

export interface DepthColors {
  tint: string;
  label: string;
  /** Secondary label (0.72 alpha, per SOFT.md). */
  secondary: string;
  inactive: string;
  green: string;
  amber: string;
  amberFill: string;
  /** Ring that separates a badge from the surface under it. */
  badgeRing: string;
}

export interface DepthTokens {
  scheme: DepthScheme;
  colors: DepthColors;
  ground: SurfaceStyle;
  /** Cards and list groups. */
  raised: SurfaceStyle;
  /** The one focal card per screen. */
  hero: SurfaceStyle;
  /** Sheets, tab bar, menus. */
  floating: SurfaceStyle;
  /** Secondary button and small raised controls. */
  button: SurfaceStyle;
  buttonPressed: SurfaceStyle;
  /** Switch thumb, selected segment, bell button. */
  knob: SurfaceStyle;
  /** Tactile primary button. */
  primary: SurfaceStyle;
  primaryPressed: SurfaceStyle;
  /** Fields and tracks pressed into the surface. */
  inset: SurfaceStyle;
  /** Avatars and icon tiles. */
  dome: SurfaceStyle;
  /** The floating Inbox dome (stronger lift than `dome`). */
  domeFloat: SurfaceStyle;
  /** Engraved 2px divider. */
  engrave: SurfaceStyle;
  /** Tab bar capsule. */
  bar: SurfaceStyle;
  /** Selected tab pill. */
  pill: SurfaceStyle;
  /** Red count badge. */
  badge: SurfaceStyle;
}

const vertical = (top: string, bottom: string, stop?: string) =>
  `linear-gradient(180deg, ${top} 0%, ${stop ? `${stop} 55%, ` : ''}${bottom} 100%)`;

const LIGHT = {
  colors: {
    label: '#000000',
    secondary: 'rgba(60,60,67,0.72)',
    inactive: 'rgba(60,60,67,0.72)',
    green: '#248A3D',
    amber: '#C93400',
    amberFill: 'rgba(255,149,0,0.15)',
    badgeRing: '#FFFFFF',
  },
  ground: { top: '#F7F7FA', bottom: '#ECEDF2' },
  raised: { top: '#FFFFFF', bottom: '#FAFAFC' },
  raisedShadow:
    'inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 0.5px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.06), 0 6px 16px -6px rgba(16,24,40,0.10), 0 18px 36px -18px rgba(16,24,40,0.14)',
  heroShadow:
    'inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 0.5px rgba(16,24,40,0.07), 0 1px 2px rgba(16,24,40,0.07), 0 10px 22px -6px rgba(16,24,40,0.14), 0 28px 48px -18px rgba(16,24,40,0.22)',
  floatShadow:
    'inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 0.5px rgba(16,24,40,0.08), 0 8px 24px -6px rgba(16,24,40,0.18), 0 28px 60px -20px rgba(16,24,40,0.28)',
  btnShadow:
    'inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 0.5px rgba(16,24,40,0.08), 0 1px 2px rgba(16,24,40,0.08), 0 4px 10px -3px rgba(16,24,40,0.14)',
  pressedShadow:
    'inset 0 2px 4px rgba(16,24,40,0.16), inset 0 0 0 0.5px rgba(16,24,40,0.08)',
  knobShadow:
    'inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 0.5px rgba(16,24,40,0.06), 0 1px 1px rgba(16,24,40,0.10), 0 3px 8px rgba(16,24,40,0.15)',
  inset: {
    bg: '#E9EAEF',
    shadow:
      'inset 0 1px 2px rgba(16,24,40,0.12), inset 0 0 0 0.5px rgba(16,24,40,0.06), 0 1px 0 rgba(255,255,255,0.8)',
  },
  dome: {
    base: '#E7E9EF',
    highlight: 'rgba(255,255,255,0.65)',
    shadow: '0 1px 2px rgba(16,24,40,0.15)',
    float:
      'inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 0.5px rgba(16,24,40,0.08), 0 8px 20px -4px rgba(16,24,40,0.20), 0 18px 36px -14px rgba(16,24,40,0.28)',
  },
  engrave:
    'linear-gradient(180deg, rgba(16,24,40,0.07) 0, rgba(16,24,40,0.07) 1px, rgba(255,255,255,1) 1px, rgba(255,255,255,1) 2px)',
  bar: { top: 'rgba(240,241,246,0.94)', bottom: 'rgba(231,233,239,0.94)' },
  pill: {
    top: '#FFFFFF',
    bottom: '#F4F5F9',
    shadow:
      'inset 0 1px 0 rgba(255,255,255,1), 0 0 0 0.5px rgba(16,24,40,0.07), 0 1px 1px rgba(16,24,40,0.10), 0 3px 8px rgba(16,24,40,0.15)',
  },
} as const;

const DARK = {
  colors: {
    label: '#FFFFFF',
    secondary: 'rgba(235,235,245,0.72)',
    inactive: 'rgba(235,235,245,0.62)',
    green: '#30DB5B',
    amber: '#FFB340',
    amberFill: 'rgba(255,149,0,0.22)',
    badgeRing: '#1C1D23',
  },
  ground: { top: '#0B0C10', bottom: '#14151B' },
  raised: { top: '#1C1D23', bottom: '#18191E' },
  raisedShadow:
    'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 0.5px rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.5), 0 6px 16px -6px rgba(0,0,0,0.5), 0 18px 36px -18px rgba(0,0,0,0.6)',
  heroShadow:
    'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 0.5px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.55), 0 10px 22px -6px rgba(0,0,0,0.55), 0 28px 48px -18px rgba(0,0,0,0.7)',
  floatShadow:
    'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 0.5px rgba(255,255,255,0.08), 0 8px 24px -6px rgba(0,0,0,0.6), 0 28px 60px -20px rgba(0,0,0,0.75)',
  btnShadow:
    'inset 0 1px 0 rgba(255,255,255,0.07), 0 0 0 0.5px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.5), 0 4px 10px -3px rgba(0,0,0,0.5)',
  pressedShadow:
    'inset 0 2px 4px rgba(0,0,0,0.4), inset 0 0 0 0.5px rgba(0,0,0,0.5)',
  knobShadow:
    'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 0.5px rgba(255,255,255,0.06), 0 1px 1px rgba(0,0,0,0.4), 0 3px 8px rgba(0,0,0,0.5)',
  inset: {
    bg: '#0F1014',
    shadow:
      'inset 0 1px 2px rgba(0,0,0,0.6), inset 0 0 0 0.5px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05)',
  },
  dome: {
    base: '#33343C',
    highlight: 'rgba(255,255,255,0.18)',
    shadow: '0 1px 2px rgba(0,0,0,0.5)',
    float:
      'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 0.5px rgba(255,255,255,0.08), 0 8px 20px -4px rgba(0,0,0,0.6), 0 18px 36px -14px rgba(0,0,0,0.7)',
  },
  engrave:
    'linear-gradient(180deg, rgba(0,0,0,0.55) 0, rgba(0,0,0,0.55) 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px)',
  bar: { top: 'rgba(38,39,46,0.94)', bottom: 'rgba(26,27,32,0.94)' },
  pill: {
    top: '#3A3B44',
    bottom: '#2D2E36',
    shadow:
      'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 0.5px rgba(255,255,255,0.08), 0 1px 1px rgba(0,0,0,0.4), 0 3px 8px rgba(0,0,0,0.5)',
  },
} as const;

const BADGE_BG = vertical('#FF6259', '#E02D23', '#FF3B30');

const cache = new Map<string, DepthTokens>();

/**
 * Depth tokens for a colour scheme and tint (hex). The system tint is swapped
 * for its dark-mode variant, as in the designs. Memoised per scheme + tint.
 */
export function getDepth(
  scheme: DepthScheme,
  tint: string = SYSTEM_TINT[scheme],
): DepthTokens {
  const resolvedTint =
    scheme === 'dark' && tint.toLowerCase() === SYSTEM_TINT.light.toLowerCase()
      ? SYSTEM_TINT.dark
      : tint;
  const key = `${scheme}:${resolvedTint}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const s = scheme === 'dark' ? DARK : LIGHT;
  const gradient = (g: { top: string; bottom: string }, shadow: string) => ({
    backgroundColor: g.top,
    experimental_backgroundImage: vertical(g.top, g.bottom),
    boxShadow: shadow,
  });
  const light = resolvedTint;
  const primaryTop = lighten(light, 0.08);
  const primaryBottom = darken(light, 0.06);

  const tokens: DepthTokens = {
    scheme,
    colors: { tint: resolvedTint, ...s.colors },
    ground: {
      backgroundColor: s.ground.top,
      experimental_backgroundImage: vertical(s.ground.top, s.ground.bottom),
    },
    raised: gradient(s.raised, s.raisedShadow),
    hero: gradient(s.raised, s.heroShadow),
    floating: gradient(s.raised, s.floatShadow),
    button: gradient(s.raised, s.btnShadow),
    buttonPressed: {
      backgroundColor: s.raised.bottom,
      boxShadow: s.pressedShadow,
    },
    knob: gradient(s.raised, s.knobShadow),
    primary: {
      backgroundColor: light,
      experimental_backgroundImage: vertical(primaryTop, primaryBottom, light),
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.12), 0 1px 2px ${withAlpha(light, 0.35)}, 0 6px 16px -4px ${withAlpha(light, 0.45)}`,
    },
    primaryPressed: {
      backgroundColor: primaryBottom,
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.18), 0 1px 1px rgba(0,0,0,0.08)',
    },
    inset: { backgroundColor: s.inset.bg, boxShadow: s.inset.shadow },
    dome: {
      backgroundColor: s.dome.base,
      experimental_backgroundImage: `linear-gradient(180deg, ${s.dome.highlight} 0%, rgba(255,255,255,0) 55%)`,
      boxShadow: s.dome.shadow,
    },
    domeFloat: {
      backgroundColor: s.dome.base,
      experimental_backgroundImage: `linear-gradient(180deg, ${s.dome.highlight} 0%, rgba(255,255,255,0) 55%)`,
      boxShadow: s.dome.float,
    },
    engrave: {
      backgroundColor: 'transparent',
      experimental_backgroundImage: s.engrave,
    },
    bar: {
      backgroundColor: s.bar.top,
      experimental_backgroundImage: vertical(s.bar.top, s.bar.bottom),
      boxShadow: s.floatShadow,
    },
    pill: gradient(s.pill, s.pill.shadow),
    badge: {
      backgroundColor: '#FF3B30',
      experimental_backgroundImage: BADGE_BG,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 0 0 2px ${s.colors.badgeRing}, 0 2px 4px rgba(255,59,48,0.45)`,
    },
  };
  cache.set(key, tokens);
  return tokens;
}
