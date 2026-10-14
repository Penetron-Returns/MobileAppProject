import { useAppColorScheme, useRestoreColorScheme } from '@booking/ui';
import { ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as React from 'react';
import { StatusBar } from 'expo-status-bar';

import { NAV_THEME } from '@/lib/theme';

/**
 * Syncs NativeWind's colour scheme with React Navigation's theme (so headers,
 * tab bars and the status bar match `global.css`), and restores the
 * persisted preference once at startup.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useRestoreColorScheme();
  const { colorScheme } = useAppColorScheme();

  return (
    <NavigationThemeProvider value={NAV_THEME[colorScheme]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {children}
    </NavigationThemeProvider>
  );
}
