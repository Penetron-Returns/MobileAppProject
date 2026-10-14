import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

import { act, render } from '../../testing/render';
import { THEME } from '../../tokens/colors';
import { useAppColorScheme, useRestoreColorScheme } from '../useAppColorScheme';

// NativeWind only switches scheme when its Tailwind config says darkMode: class,
// which Jest does not load. The hook's own job is to persist and to expose colours.
const mockSetColorScheme = jest.fn();
let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({
  ...jest.requireActual('nativewind'),
  useColorScheme: () => ({
    colorScheme: mockScheme,
    setColorScheme: mockSetColorScheme,
  }),
}));

type Out = { current?: ReturnType<typeof useAppColorScheme> };
function Probe({ out }: { out: Out }) {
  out.current = useAppColorScheme();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockScheme = 'light';
});

describe('useAppColorScheme', () => {
  it('exposes the raw colours of the current scheme', () => {
    const out: Out = {};
    render(<Probe out={out} />);
    expect(out.current?.colorScheme).toBe('light');
    expect(out.current?.colors.primary).toBe(THEME.light.primary);
  });

  it('persists an explicit choice', () => {
    const out: Out = {};
    render(<Probe out={out} />);
    act(() => out.current?.setColorScheme('dark'));
    expect(mockSetColorScheme).toHaveBeenCalledWith('dark');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'pref.colorScheme',
      'dark',
    );
  });

  it('toggles between light and dark', () => {
    const out: Out = {};
    render(<Probe out={out} />);
    act(() => out.current?.toggle());
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
      'pref.colorScheme',
      'dark',
    );
  });

  it('toggles from dark back to light', () => {
    mockScheme = 'dark';
    const out: Out = {};
    render(<Probe out={out} />);
    expect(out.current?.isDark).toBe(true);
    expect(out.current?.colors).toBe(THEME.dark);
    act(() => out.current?.toggle());
    expect(mockSetColorScheme).toHaveBeenCalledWith('light');
  });
});

describe('useRestoreColorScheme', () => {
  function Restore() {
    useRestoreColorScheme();
    return null;
  }

  it('restores a saved explicit choice once at startup', async () => {
    await AsyncStorage.setItem('pref.colorScheme', 'dark');
    await act(async () => {
      render(<Restore />);
    });
    expect(mockSetColorScheme).toHaveBeenCalledWith('dark');
  });

  it('keeps following the system when nothing explicit was saved', async () => {
    await AsyncStorage.removeItem('pref.colorScheme');
    await act(async () => {
      render(<Restore />);
    });
    expect(mockSetColorScheme).not.toHaveBeenCalled();
  });
});
