import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useNativewindColorScheme } from 'nativewind';
import { useCallback, useContext, useEffect, useState } from 'react';

import { THEME } from '../tokens/colors';
import { SchemeContext } from './SchemeScope';

const STORAGE_KEY = 'pref.colorScheme';

/**
 * Dark mode via NativeWind (`darkMode: 'class'`). The explicit choice from
 * Settings is persisted; until one is made we follow the system.
 */
export function useAppColorScheme() {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  const forced = useContext(SchemeContext);
  const scheme: 'light' | 'dark' =
    forced ?? (colorScheme === 'dark' ? 'dark' : 'light');

  const setScheme = useCallback(
    (next: 'light' | 'dark' | 'system') => {
      setColorScheme(next);
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
    },
    [setColorScheme],
  );

  return {
    colorScheme: scheme,
    isDark: scheme === 'dark',
    colors: THEME[scheme],
    setColorScheme: setScheme,
    toggle: () => setScheme(scheme === 'dark' ? 'light' : 'dark'),
  };
}

/**
 * Restores the persisted preference once at startup. Returns whether it has
 * been applied (also true when nothing was saved or the read failed), so the
 * app can hold its first frame and never flash the wrong theme.
 */
export function useRestoreColorScheme(): boolean {
  const { setColorScheme } = useNativewindColorScheme();
  const [isRestored, setIsRestored] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark') setColorScheme(v);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setIsRestored(true);
      });
    return () => {
      alive = false;
    };
  }, [setColorScheme]);
  return isRestored;
}
