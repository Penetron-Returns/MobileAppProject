import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { haptics } from '../haptics';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

const mocked = Haptics as jest.Mocked<typeof Haptics>;

describe('haptics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps selection to selectionAsync', () => {
    haptics.selection();
    expect(mocked.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('maps light to a light impact', () => {
    haptics.light();
    expect(mocked.impactAsync).toHaveBeenCalledWith('light');
  });

  it.each([
    ['success', 'success'],
    ['warning', 'warning'],
    ['error', 'error'],
  ] as const)('maps %s to the %s notification', (name, type) => {
    haptics[name]();
    expect(mocked.notificationAsync).toHaveBeenCalledWith(type);
  });

  it('fires exactly one engine call per helper', () => {
    haptics.success();
    const calls =
      mocked.selectionAsync.mock.calls.length +
      mocked.impactAsync.mock.calls.length +
      mocked.notificationAsync.mock.calls.length;
    expect(calls).toBe(1);
  });

  it('never throws when the engine throws or rejects', () => {
    mocked.selectionAsync.mockImplementationOnce(() => {
      throw new Error('no engine');
    });
    mocked.impactAsync.mockImplementationOnce(() =>
      Promise.reject(new Error('nope')),
    );
    expect(() => haptics.selection()).not.toThrow();
    expect(() => haptics.light()).not.toThrow();
  });

  it('does nothing on the web', () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    haptics.selection();
    haptics.error();
    Object.defineProperty(Platform, 'OS', {
      value: original,
      configurable: true,
    });
    expect(mocked.selectionAsync).not.toHaveBeenCalled();
    expect(mocked.notificationAsync).not.toHaveBeenCalled();
  });
});
