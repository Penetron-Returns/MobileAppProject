import { useAppColorScheme, useRestoreColorScheme } from '@booking/ui';
import { ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as React from 'react';
import { StatusBar } from 'expo-status-bar';

import { NAV_THEME } from '@/lib/theme';

/**
 * Syncs NativeWind's colour scheme with React Navigation's theme (so headers,
 * tab bars and the status bar match `global.css`), and restores the
 * persisted preference before the first frame.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const isRestored = useRestoreColorScheme();
  const { colorScheme } = useAppColorScheme();

  return (
    <NavigationThemeProvider value={NAV_THEME[colorScheme]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* Held until the saved choice is applied: the splash is still up, so a dark-mode user never sees a light flash. */}
      {isRestored ? children : null}
    </NavigationThemeProvider>
  );
}
