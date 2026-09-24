import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme as useNativewindColorScheme } from 'nativewind';
import { useCallback, useEffect } from 'react';

import { THEME } from '@/lib/theme';

const STORAGE_KEY = 'pref.colorScheme';

/**
 * Dark mode via NativeWind (`darkMode: 'class'`). The explicit choice from
 * Settings is persisted; until one is made we follow the system.
 */
export function useAppColorScheme() {
  const { colorScheme, setColorScheme } = useNativewindColorScheme();
  const scheme: 'light' | 'dark' = colorScheme === 'dark' ? 'dark' : 'light';

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

/** Restores the persisted preference once at startup. */
export function useRestoreColorScheme() {
  const { setColorScheme } = useNativewindColorScheme();
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v === 'light' || v === 'dark') setColorScheme(v);
      })
      .catch(() => undefined);
  }, [setColorScheme]);
}
