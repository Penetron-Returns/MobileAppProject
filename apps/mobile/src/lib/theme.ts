import { THEME } from '@booking/ui';
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router';

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
