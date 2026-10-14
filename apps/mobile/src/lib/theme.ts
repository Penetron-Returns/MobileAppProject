import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

/**
 * JS mirror of the CSS variables in global.css, for places that need a raw
 * colour (SVG strokes, navigation theme, status bar, RefreshControl).
 */
export const THEME = {
  light: {
    background: 'hsl(240, 20%, 97%)',
    foreground: 'hsl(0, 0%, 0%)',
    card: 'hsl(0, 0%, 100%)',
    primary: 'hsl(211, 100%, 50%)',
    brand: 'hsl(211, 100%, 50%)',
    brandSoft: 'hsl(211, 100%, 95%)',
    muted: 'hsl(240, 14%, 94%)',
    mutedForeground: 'hsl(240, 2%, 46%)',
    border: 'hsl(240, 10%, 90%)',
    destructive: 'hsl(0, 72%, 51%)',
    whatsapp: 'hsl(142, 70%, 42%)',
    hatch: 'hsla(215, 16%, 47%, 0.14)',
  },
  dark: {
    background: 'hsl(230, 22%, 6%)',
    foreground: 'hsl(0, 0%, 100%)',
    card: 'hsl(230, 11%, 12%)',
    primary: 'hsl(211, 100%, 52%)',
    brand: 'hsl(211, 100%, 56%)',
    brandSoft: 'hsl(211, 50%, 20%)',
    muted: 'hsl(230, 10%, 15%)',
    mutedForeground: 'hsl(240, 8%, 70%)',
    border: 'hsl(230, 9%, 20%)',
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
