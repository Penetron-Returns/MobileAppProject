import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

/**
 * JS mirror of the CSS variables in global.css, for places that need a raw
 * colour (SVG strokes, navigation theme, status bar, RefreshControl).
 */
export const THEME = {
  light: {
    background: 'hsl(220, 43%, 97%)',
    foreground: 'hsl(216, 50%, 12%)',
    card: 'hsl(0, 0%, 100%)',
    primary: 'hsl(197, 86%, 30%)',
    brand: 'hsl(201, 62%, 47%)',
    brandSoft: 'hsl(205, 70%, 93%)',
    muted: 'hsl(216, 33%, 95%)',
    mutedForeground: 'hsl(215, 16%, 47%)',
    border: 'hsl(214, 28%, 90%)',
    destructive: 'hsl(0, 72%, 51%)',
    whatsapp: 'hsl(142, 70%, 42%)',
    hatch: 'hsla(215, 16%, 47%, 0.14)',
  },
  dark: {
    background: 'hsl(216, 40%, 7%)',
    foreground: 'hsl(210, 40%, 96%)',
    card: 'hsl(216, 35%, 11%)',
    primary: 'hsl(199, 75%, 45%)',
    brand: 'hsl(199, 75%, 55%)',
    brandSoft: 'hsl(200, 45%, 20%)',
    muted: 'hsl(216, 30%, 15%)',
    mutedForeground: 'hsl(215, 20%, 65%)',
    border: 'hsl(216, 25%, 20%)',
    destructive: 'hsl(0, 70%, 55%)',
    whatsapp: 'hsl(142, 65%, 45%)',
    hatch: 'hsla(215, 20%, 65%, 0.12)',
  },
} as const;

export type ThemeColors = (typeof THEME)['light'];

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};

/** Staff colour palette offered in Staff management. */
export const STAFF_COLORS = [
  '#0B6A8F',
  '#2E8FC4',
  '#6D5BD0',
  '#C2410C',
  '#15803D',
  '#BE185D',
  '#B45309',
  '#475569',
];
