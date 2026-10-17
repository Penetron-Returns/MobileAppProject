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
  shape: string;
  line: string;
  light: { tile: [string, string]; ink: string };
  dark: { tile: [string, string]; ink: string };
}

export const KIND_GLYPHS: Record<StoryKind, KindGlyph> = {
  brief: {
    // lucide "sunrise": the half sun is the filled shape, the rays and horizon the line.
    shape: 'M16 18a4 4 0 0 0-8 0z',
    line: 'M12 2v8 M4.93 10.93l1.41 1.41 M2 18h2 M20 18h2 M19.07 10.93l-1.41 1.41 M22 22H2 M8 6l4-4 4 4',
    light: { tile: ['#EAF6FC', '#D2EBF8'], ink: '#1078AF' },
    dark: { tile: ['#1F3E4D', '#16303D'], ink: '#9DD9F5' },
  },
  clients: {
    shape:
      'M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7z M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5z',
    line: 'M16 4.4a3.5 3.5 0 0 1 0 6.2 M18.2 14.9c1.9.7 3.3 2.3 3.3 5.1',
    light: { tile: ['#E4F1FB', '#CFE4F5'], ink: '#1078AF' },
    dark: { tile: ['#1D3A4F', '#142B3B'], ink: '#9DD9F5' },
  },
  business: {
    shape: 'M4 18.75v-6h4v6z M10 18.75V4.75h4v14z M16 18.75v-9h4v9z',
    line: 'M3 19.25h18',
    light: { tile: ['#E1F7F5', '#C7EEEB'], ink: '#0B7F7A' },
    dark: { tile: ['#1A3D3D', '#122E2F'], ink: '#5ECFC9' },
  },
  product: {
    shape: 'M11 4l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
    line: 'M19.5 16v4 M17.5 18h4',
    light: { tile: ['#E8F0FB', '#D2E1F5'], ink: '#1078AF' },
    dark: { tile: ['#203A52', '#172B3F'], ink: '#9DD9F5' },
  },
};

/**
 * Stops of the full-page tone wash behind a story: the tone's two glow colours
 * run top to bottom over the whole viewer, so the page reads as washed in the
 * tone and not just two corner blobs. Static colours for a native gradient.
 */
export function toneWash(tone: StoryTone): [string, string, string] {
  const { glow1, glow2 } = TONES[tone];
  return [`rgba(${glow1},0.34)`, `rgba(${glow2},0.14)`, `rgba(${glow2},0.24)`];
}
