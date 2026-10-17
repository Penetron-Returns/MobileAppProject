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

export type CapsuleToneKey = 'neutral' | 'amber' | 'green' | 'grey';

/** Fill and text colour of a status capsule (`text: null` = the muted label colour). */
export interface CapsuleColors {
  fill: string;
  text: string | null;
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
  /** Fill of the solid green "on"/done controls. */
  success: string;
  /** Alert red: today marker, destructive text, the red badge. */
  red: string;
  /** Content on a tinted or red fill (the white of a selected day, a badge). */
  onFill: string;
  /** Red for text on a surface ("Sign out", "Delete"); darker than `red` in light. */
  destructiveText: string;
  /** Hairline between the halves of a control (the stepper's centre line). */
  hairline: string;
  /** Translucent fill behind a sticky section header (Clients A-Z board). */
  stickyHeader: string;
  /** Solid fill of a row inside a raised group (Clients A-Z board). */
  groupRow: string;
}

/** The eight system colours a person picks for their calendar column. */
export const SYSTEM_COLORS = {
  blue: { light: '#007AFF', dark: '#0A84FF' },
  orange: { light: '#FF9500', dark: '#FF9F0A' },
  purple: { light: '#AF52DE', dark: '#BF5AF2' },
  teal: { light: '#30B0C7', dark: '#40C8E0' },
  green: { light: '#34C759', dark: '#30D158' },
  pink: { light: '#FF2D55', dark: '#FF375F' },
  indigo: { light: '#5856D6', dark: '#5E5CE6' },
  red: { light: '#FF3B30', dark: '#FF453A' },
} as const;

export type SystemColorKey = keyof typeof SYSTEM_COLORS;

export const SYSTEM_COLOR_KEYS = Object.keys(SYSTEM_COLORS) as SystemColorKey[];

/** The system colour a stored hex stands for (either scheme's variant), if any. */
export function systemColorKey(
  stored: string | null | undefined,
): SystemColorKey | null {
  if (!stored) return null;
  const hex = stored.toLowerCase();
  return (
    SYSTEM_COLOR_KEYS.find(
      (k) =>
        SYSTEM_COLORS[k].light.toLowerCase() === hex ||
        SYSTEM_COLORS[k].dark.toLowerCase() === hex,
    ) ?? null
  );
}

/**
 * What to paint for a stored colour in this scheme: a system colour swaps to
 * its dark variant, any other hex (older data) is returned as it is.
 */
export function resolveSystemColor(
  stored: string | null | undefined,
  scheme: DepthScheme,
): string | null {
  if (!stored) return null;
  const key = systemColorKey(stored);
  return key ? SYSTEM_COLORS[key][scheme] : stored;
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
  /** Bell button and other small raised controls. */
  knob: SurfaceStyle;
  /** Switch thumb (white in both schemes). */
  thumb: SurfaceStyle;
  /** The selected segment of a segmented control. */
  segment: SurfaceStyle;
  /** Frosted back pill: translucent fill, border, drop shadow and top highlight. */
  glass: Pick<ViewStyle, 'backgroundColor' | 'borderColor' | 'boxShadow'>;
  /** The fade under the status bar of a glass-nav screen (opaque on top, clear below). */
  navFade: SurfaceStyle;
  /** A pressed row of a group: dim fill, pressed in. */
  rowPressed: SurfaceStyle;
  /** The inline time wheel: the well, the centre bar and the two edge fades. */
  wheel: SurfaceStyle;
  wheelSelection: SurfaceStyle;
  wheelTop: SurfaceStyle;
  wheelBottom: SurfaceStyle;
  /** Full-height sheet ground, its pinned footer fade, grabber and the scrim behind it. */
  sheet: SurfaceStyle;
  sheetFade: SurfaceStyle;
  grabber: string;
  scrim: string;
  /** The quiet VIP label of a client row: neutral fill, pressed-in. */
  vipCapsule: SurfaceStyle;
  /** Avatar with a coloured ring: neutral fill under a lit dome. */
  domeRing: SurfaceStyle;
  /** Tint-filled avatar (the business row of Settings). */
  domeTint: SurfaceStyle;
  /** Selected-state wash of a time field. */
  tintWash: string;
  /** Primary button: flat tint fill. */
  primary: SurfaceStyle;
  /** The tab bar's "+" (navigation keeps depth): the lit tint gradient. */
  navPrimary: SurfaceStyle;
  navPrimaryPressed: SurfaceStyle;
  primaryPressed: SurfaceStyle;
  /** Fields and tracks pressed into the surface. */
  inset: SurfaceStyle;
  /** Avatars and icon tiles. */
  dome: SurfaceStyle;
  /** The floating Inbox dome (stronger lift than `dome`). */
  domeFloat: SurfaceStyle;
  /**
   * Engraved 2px divider: a 1px shadow line (engraveLine) over a 1px highlight line (engraveLight). Two solid
   * lines, not a hard-stop gradient (a 2px gradient did not render on Android).
   */
  engrave: SurfaceStyle;
  engraveLine: string;
  engraveLight: string;
  /** Tab bar capsule. */
  bar: SurfaceStyle;
  /** Selected tab pill. */
  pill: SurfaceStyle;
  /** Red count badge. */
  badge: SurfaceStyle;
  /** Status capsule colours (Foundations: status only for exceptions). */
  capsule: Record<CapsuleToneKey, CapsuleColors>;
}

/** The lit-from-above highlight over a dome (the boards' radial gradient). */
const domeLight = (highlight: string) =>
  `radial-gradient(120% 90% at 50% 0%, ${highlight}, rgba(255,255,255,0) 55%)`;

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
    success: '#34C759',
    red: '#FF3B30',
    onFill: '#FFFFFF',
    destructiveText: '#D70015',
    hairline: 'rgba(60,60,67,0.29)',
    stickyHeader: 'rgba(244,245,249,0.8)',
    groupRow: '#FCFCFD',
  },
  capsule: {
    neutral: { fill: 'rgba(118,118,128,0.14)', text: null },
    amber: { fill: 'rgba(255,149,0,0.15)', text: '#C93400' },
    green: { fill: 'rgba(52,199,89,0.15)', text: '#248A3D' },
    grey: { fill: 'rgba(142,142,147,0.15)', text: 'rgba(60,60,67,0.72)' },
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
  engrave: { line: 'rgba(16,24,40,0.07)', light: 'rgba(255,255,255,1)' },
  bar: { top: 'rgba(240,241,246,0.94)', bottom: 'rgba(231,233,239,0.94)' },
  pill: {
    top: '#FFFFFF',
    bottom: '#F4F5F9',
    shadow:
      'inset 0 1px 0 rgba(255,255,255,1), 0 0 0 0.5px rgba(16,24,40,0.07), 0 1px 1px rgba(16,24,40,0.10), 0 3px 8px rgba(16,24,40,0.15)',
  },
  thumb: { top: '#FFFFFF', bottom: '#F6F6F9' },
  segment: { top: '#FFFFFF', bottom: '#F4F5F8' },
  glass: {
    fill: 'rgba(255,255,255,0.62)',
    border: 'rgba(255,255,255,0.7)',
    shadow: '0 4px 16px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
  navFade: 'rgba(242,242,247,0.6)',
  navFadeClear: 'rgba(242,242,247,0)',
  rowPressed: {
    bg: 'rgba(16,24,40,0.055)',
    shadow: 'inset 0 2px 4px rgba(16,24,40,0.08)',
  },
  wheel: { bg: '#F7F7FA', clear: 'rgba(247,247,250,0)' },
  wheelSelection: 'rgba(118,118,128,0.12)',
  sheet: { top: '#F7F7FA', bottom: '#ECEDF2' },
  sheetShadow:
    'inset 0 1px 0 rgba(255,255,255,0.95), 0 0 0 0.5px rgba(16,24,40,0.08), 0 -8px 24px -6px rgba(16,24,40,0.18), 0 -28px 60px -20px rgba(16,24,40,0.28)',
  sheetFade: 'rgba(242,242,247,0.85)',
  grabber: 'rgba(60,60,67,0.3)',
  ringFill: 'rgba(118,118,128,0.12)',
  vipInset: 'inset 0 1px 1px rgba(0,0,0,0.06)',
  tintWashAlpha: 0.15,
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
    success: '#30D158',
    red: '#FF453A',
    onFill: '#FFFFFF',
    destructiveText: '#FF453A',
    hairline: 'rgba(84,84,88,0.6)',
    stickyHeader: 'rgba(14,15,20,0.78)',
    groupRow: '#1A1B20',
  },
  capsule: {
    neutral: { fill: 'rgba(118,118,128,0.14)', text: null },
    amber: { fill: 'rgba(255,149,0,0.22)', text: '#FFB340' },
    green: { fill: 'rgba(52,199,89,0.22)', text: '#30DB5B' },
    grey: { fill: 'rgba(142,142,147,0.22)', text: 'rgba(235,235,245,0.72)' },
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
  engrave: { line: 'rgba(0,0,0,0.55)', light: 'rgba(255,255,255,0.05)' },
  bar: { top: 'rgba(38,39,46,0.94)', bottom: 'rgba(26,27,32,0.94)' },
  pill: {
    top: '#3A3B44',
    bottom: '#2D2E36',
    shadow:
      'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 0.5px rgba(255,255,255,0.08), 0 1px 1px rgba(0,0,0,0.4), 0 3px 8px rgba(0,0,0,0.5)',
  },
  thumb: { top: '#FFFFFF', bottom: '#F1F1F4' },
  segment: { top: '#5A5C66', bottom: '#484A53' },
  glass: {
    fill: 'rgba(40,40,42,0.62)',
    border: 'rgba(255,255,255,0.12)',
    shadow: '0 4px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  navFade: 'rgba(0,0,0,0.6)',
  navFadeClear: 'rgba(0,0,0,0)',
  rowPressed: {
    bg: 'rgba(0,0,0,0.3)',
    shadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
  },
  wheel: { bg: '#2C2C2E', clear: 'rgba(44,44,46,0)' },
  wheelSelection: 'rgba(118,118,128,0.24)',
  sheet: { top: '#14151B', bottom: '#0F1014' },
  sheetShadow:
    'inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 0.5px rgba(255,255,255,0.08), 0 -8px 24px -6px rgba(0,0,0,0.55), 0 -28px 60px -20px rgba(0,0,0,0.7)',
  sheetFade: 'rgba(0,0,0,0.85)',
  grabber: 'rgba(235,235,245,0.3)',
  ringFill: 'rgba(118,118,128,0.24)',
  vipInset: 'inset 0 1px 1px rgba(0,0,0,0.25)',
  tintWashAlpha: 0.22,
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
  const primaryBottom = darken(light, 0.1);

  // Depth lives only on navigation (tab bar, its pill and badge, the floating
  // dome). Everything else is a flat fill with a 0.5pt hairline ring: hierarchy
  // comes from fill, spacing and weight, not shadow. A spread-only shadow has
  // no blur, so it costs nothing to draw.
  const ringColor =
    scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(16,24,40,0.08)';
  const ring = `0 0 0 0.5px ${ringColor}`;
  const flat = (backgroundColor: string) => ({
    backgroundColor,
    boxShadow: ring,
  });
  const fill = (backgroundColor: string) => ({ backgroundColor });

  const tokens: DepthTokens = {
    scheme,
    colors: { tint: resolvedTint, ...s.colors },
    capsule: s.capsule,
    ground: {
      backgroundColor: s.ground.top,
      experimental_backgroundImage: vertical(s.ground.top, s.ground.bottom),
    },
    raised: flat(s.raised.top),
    hero: flat(s.raised.top),
    floating: flat(s.raised.top),
    button: flat(s.raised.bottom),
    buttonPressed: fill(s.inset.bg),
    knob: flat(s.raised.top),
    thumb: flat(s.thumb.top),
    segment: flat(s.segment.top),
    glass: {
      backgroundColor: s.glass.fill,
      borderColor: s.glass.border,
      boxShadow: [],
    },
    navFade: {
      backgroundColor: s.navFade,
      experimental_backgroundImage: `linear-gradient(180deg, ${s.navFade} 0%, ${s.navFade} 72%, ${s.navFadeClear} 100%)`,
    },
    rowPressed: fill(s.rowPressed.bg),
    wheel: fill(s.wheel.bg),
    wheelSelection: fill(s.wheelSelection),
    wheelTop: {
      backgroundColor: 'transparent',
      experimental_backgroundImage: `linear-gradient(${s.wheel.bg}, ${s.wheel.clear})`,
    },
    wheelBottom: {
      backgroundColor: 'transparent',
      experimental_backgroundImage: `linear-gradient(${s.wheel.clear}, ${s.wheel.bg})`,
    },
    sheet: flat(s.sheet.top),
    sheetFade: { backgroundColor: s.sheetFade },
    grabber: s.grabber,
    scrim: 'rgba(0,0,0,0.32)',
    vipCapsule: fill(s.ringFill),
    domeRing: fill(s.ringFill),
    domeTint: fill(light),
    tintWash: withAlpha(light, s.tintWashAlpha),
    primary: fill(light),
    navPrimary: {
      backgroundColor: light,
      experimental_backgroundImage: vertical(
        lighten(light, 0.16),
        primaryBottom,
        light,
      ),
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.12), 0 1px 2px ${withAlpha(light, 0.35)}, 0 6px 16px -4px ${withAlpha(light, 0.45)}`,
    },
    navPrimaryPressed: {
      backgroundColor: primaryBottom,
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.18), 0 1px 1px rgba(0,0,0,0.08)',
    },
    primaryPressed: fill(primaryBottom),
    inset: fill(s.inset.bg),
    dome: fill(s.dome.base),
    domeFloat: {
      backgroundColor: s.dome.base,
      experimental_backgroundImage: domeLight(s.dome.highlight),
      boxShadow: s.dome.float,
    },
    engrave: { backgroundColor: 'transparent' },
    engraveLine: s.engrave.line,
    engraveLight: s.engrave.light,
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
