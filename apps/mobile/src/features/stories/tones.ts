import type { StoryKind, StoryTone } from './model';

export interface TonePalette {
  accent: string;
  /** Ring gradient stops, for the new-story bubble. */
  ring: [string, string, string, string, string];
  /** Radial glow colours as `r,g,b`, and the strength of the first one. */
  glow1: string;
  glow2: string;
  glowAlpha: number;
}

export const TONES: Record<StoryTone, TonePalette> = {
  positive: {
    accent: '#6FE3BC',
    ring: ['#14866A', '#2FBF95', '#8BEBCB', '#5ECFC9', '#14866A'],
    glow1: '47,191,149',
    glow2: '94,207,201',
    glowAlpha: 0.36,
  },
  neutral: {
    accent: '#9DD9F5',
    ring: ['#1078AF', '#2AA1D6', '#9DD9F5', '#5ECFC9', '#1078AF'],
    glow1: '42,161,214',
    glow2: '94,207,201',
    glowAlpha: 0.5,
  },
  attention: {
    accent: '#FFC266',
    ring: ['#D97A00', '#FFA21F', '#FFD98A', '#FF9F0A', '#D97A00'],
    glow1: '255,159,10',
    glow2: '255,196,102',
    glowAlpha: 0.34,
  },
  concern: {
    accent: '#FF9E94',
    ring: ['#D9574E', '#FF8A80', '#FFC2BB', '#F0766B', '#D9574E'],
    glow1: '255,122,110',
    glow2: '255,170,160',
    glowAlpha: 0.32,
  },
};

export const TONE_ORDER: StoryTone[] = [
  'positive',
  'neutral',
  'attention',
  'concern',
];

export function paletteFor(tone: StoryTone): TonePalette {
  return TONES[tone];
}

/** The second glow is 60% of the first, as on the board. */
export function glowStops(tone: StoryTone) {
  const p = TONES[tone];
  return {
    first: { rgb: p.glow1, alpha: p.glowAlpha },
    second: { rgb: p.glow2, alpha: Number((p.glowAlpha * 0.6).toFixed(2)) },
  };
}

export interface KindGlyph {
  /** Brief uses the Clovie image instead of a glyph. */
  isImage: boolean;
  shape: string;
  line: string;
  light: { tile: [string, string]; ink: string };
  dark: { tile: [string, string]; ink: string };
}

const NONE = 'M0 0';
export const KIND_GLYPHS: Record<StoryKind, KindGlyph> = {
  brief: {
    isImage: true,
    shape: NONE,
    line: NONE,
    light: { tile: ['#EAF6FC', '#D2EBF8'], ink: '#1078AF' },
    dark: { tile: ['#1F3E4D', '#16303D'], ink: '#9DD9F5' },
  },
  clients: {
    isImage: false,
    shape:
      'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5z',
    line: 'M16 4.4a3.5 3.5 0 0 1 0 6.2 M18.2 14.9c1.9.7 3.3 2.3 3.3 5.1',
    light: { tile: ['#E4F1FB', '#CFE4F5'], ink: '#1078AF' },
    dark: { tile: ['#1D3A4F', '#142B3B'], ink: '#9DD9F5' },
  },
  business: {
    isImage: false,
    shape: 'M4 20v-6h4v6z M10 20V6h4v14z M16 20v-9h4v9z',
    line: 'M3 20.5h18',
    light: { tile: ['#E1F7F5', '#C7EEEB'], ink: '#0B7F7A' },
    dark: { tile: ['#1A3D3D', '#122E2F'], ink: '#5ECFC9' },
  },
  product: {
    isImage: false,
    shape: 'M11 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
    line: 'M19.5 15v4 M17.5 17h4',
    light: { tile: ['#E8F0FB', '#D2E1F5'], ink: '#1078AF' },
    dark: { tile: ['#203A52', '#172B3F'], ink: '#9DD9F5' },
  },
};
