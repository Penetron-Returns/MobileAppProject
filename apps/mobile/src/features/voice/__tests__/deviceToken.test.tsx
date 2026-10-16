import * as React from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import {
  DEVICE_TOKEN_KEY,
  INSTALL_ID_KEY,
  clearDeviceToken,
  ensureDeviceToken,
  ensureDeviceTokenOnce,
  useVoiceDeviceToken,
  type DeviceTokenDeps,
} from '../deviceToken';

const mockStore = new Map<string, string>();
const mockMint = jest.fn();
const mockRevoke = jest.fn();
const mockSetNative = jest.fn((..._args: unknown[]) => true);
const mockClearNative = jest.fn();
let mockNativeState = 'none';

jest.mock('expo-secure-store', () => ({
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => void mockStore.set(k, v),
  deleteItemAsync: async (k: string) => void mockStore.delete(k),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => 'abcdef12-0000-4000-8000-000000000000',
}));
jest.mock('@/lib/env', () => ({ env: { apiUrl: 'https://api.example.com' } }));
jest.mock('@/lib/api', () => ({
  newIdempotencyKey: () => 'idem-key-0001',
  api: {
    mintVoiceDeviceToken: (...a: unknown[]) => mockMint(...a),
    revokeVoiceDeviceToken: (...a: unknown[]) => mockRevoke(...a),
  },
}));
jest.mock('../clovieVoice', () => ({
  setVoiceToken: (...a: unknown[]) => mockSetNative(...a),
  clearVoiceToken: () => mockClearNative(),
  getVoiceTokenState: () => mockNativeState,
}));

function deps(patch: Partial<DeviceTokenDeps> = {}): DeviceTokenDeps {
  let n = 0;
  return {
    secure: {
      get: async (k) => mockStore.get(k) ?? null,
      set: async (k, v) => void mockStore.set(k, v),
      remove: async (k) => void mockStore.delete(k),
    },
    mint: jest.fn(async () => `cvt_minted${(n += 1)}`),
    revoke: jest.fn(async () => undefined),
    native: {
      setToken: jest.fn(() => true),
      clear: jest.fn(),
      state: () => 'none' as const,
    },
    apiUrl: 'https://api.example.com',
    platform: 'android',
    newId: () => 'abcdef12-0000-4000-8000-000000000000',
    ...patch,
  };
}

const offline = async () => {
  throw new Error('offline');
};

beforeEach(() => {
  mockStore.clear();
  mockMint.mockReset().mockResolvedValue({ token: 'cvt_from_api' });
  mockRevoke.mockReset().mockResolvedValue({ revoked: true });
  mockSetNative.mockClear();
  mockClearNative.mockClear();
  mockNativeState = 'none';
});

describe('ensureDeviceToken', () => {
  it('mints once, stores it securely and hands it to the native service', async () => {
    const d = deps();
    await expect(ensureDeviceToken(d)).resolves.toBe('minted');
    expect(d.mint).toHaveBeenCalledWith('android-abcdef12');
    expect(mockStore.get(DEVICE_TOKEN_KEY)).toBe('cvt_minted1');
    expect(d.native.setToken).toHaveBeenCalledWith(
      'cvt_minted1',
      'https://api.example.com',
    );
  });

  it('reuses a stored token and re-sends it to native without minting', async () => {
    mockStore.set(DEVICE_TOKEN_KEY, 'cvt_existing');
    const d = deps();
    await expect(ensureDeviceToken(d)).resolves.toBe('reused');
    expect(d.mint).not.toHaveBeenCalled();
    expect(d.native.setToken).toHaveBeenCalledWith(
      'cvt_existing',
      'https://api.example.com',
    );
  });

  it('re-mints when the native service says the server refused the token', async () => {
    mockStore.set(DEVICE_TOKEN_KEY, 'cvt_old');
    const d = deps({
      native: {
        setToken: jest.fn(() => true),
        clear: jest.fn(),
        state: () => 'rejected',
      },
    });
    await expect(ensureDeviceToken(d)).resolves.toBe('minted');
    expect(mockStore.get(DEVICE_TOKEN_KEY)).toBe('cvt_minted1');
    expect(d.native.setToken).toHaveBeenCalledWith(
      'cvt_minted1',
      expect.any(String),
    );
  });

  it('re-mints after the JS side dropped a refused token (store empty)', async () => {
    const d = deps();
    await ensureDeviceToken(d);
    mockStore.delete(DEVICE_TOKEN_KEY); // what the API client does on a 401
    await expect(ensureDeviceToken(d)).resolves.toBe('minted');
  });

  it('keeps one install id so the device label is stable across re-mints', async () => {
    const d = deps();
    await ensureDeviceToken(d);
    mockStore.delete(DEVICE_TOKEN_KEY);
    await ensureDeviceToken(d);
    expect(mockStore.get(INSTALL_ID_KEY)).toBe(
      'abcdef12-0000-4000-8000-000000000000',
    );
    expect((d.mint as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
      'android-abcdef12',
      'android-abcdef12',
    ]);
  });

  it('stores nothing when the mint fails (offline)', async () => {
    const d = deps({ mint: jest.fn(offline) });
    await expect(ensureDeviceToken(d)).rejects.toThrow('offline');
    expect(mockStore.has(DEVICE_TOKEN_KEY)).toBe(false);
    expect(d.native.setToken).not.toHaveBeenCalled();
  });
});

describe('clearDeviceToken', () => {
  it('revokes on the server, then clears secure storage and native', async () => {
    mockStore.set(DEVICE_TOKEN_KEY, 'cvt_x');
    const d = deps();
    await clearDeviceToken(d, { revokeRemote: true });
    expect(d.revoke).toHaveBeenCalledTimes(1);
    expect(mockStore.has(DEVICE_TOKEN_KEY)).toBe(false);
    expect(d.native.clear).toHaveBeenCalledTimes(1);
  });

  it('still clears locally when the revoke fails (offline)', async () => {
    mockStore.set(DEVICE_TOKEN_KEY, 'cvt_x');
    const d = deps({ revoke: jest.fn(offline) });
    await clearDeviceToken(d, { revokeRemote: true });
    expect(mockStore.has(DEVICE_TOKEN_KEY)).toBe(false);
    expect(d.native.clear).toHaveBeenCalledTimes(1);
  });
});

describe('ensureDeviceTokenOnce', () => {
  it('shares one run between concurrent callers and never rejects', async () => {
    const d = deps();
    await Promise.all([ensureDeviceTokenOnce(d), ensureDeviceTokenOnce(d)]);
    expect(d.mint).toHaveBeenCalledTimes(1);
    mockStore.clear();
    await expect(
      ensureDeviceTokenOnce(deps({ mint: jest.fn(offline) })),
    ).resolves.toBeUndefined();
  });
});

describe('useVoiceDeviceToken', () => {
  function Probe({ enabled }: { enabled: boolean }) {
    useVoiceDeviceToken(enabled);
    return null;
  }

  it('mints through the API when enabled, then re-mints on foreground only after a refusal', async () => {
    let listener: ((state: string) => void) | undefined;
    const sub = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, fn) => {
        listener = fn as (state: string) => void;
        return { remove: jest.fn() } as never;
      });
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Probe enabled />);
    });
    expect(mockMint).toHaveBeenCalledTimes(1);
    expect(mockMint).toHaveBeenCalledWith(
      { device_label: expect.stringMatching(/^[a-z]+-abcdef12$/) },
      'idem-key-0001',
    );
    expect(mockStore.get(DEVICE_TOKEN_KEY)).toBe('cvt_from_api');
    expect(mockSetNative).toHaveBeenCalledWith(
      'cvt_from_api',
      'https://api.example.com',
    );

    await act(async () => listener?.('active'));
    expect(mockMint).toHaveBeenCalledTimes(1); // stored: reused

    mockNativeState = 'rejected';
    await act(async () => listener?.('active'));
    expect(mockMint).toHaveBeenCalledTimes(2); // the service saw a 401

    act(() => tree.unmount());
    sub.mockRestore();
  });

  it('does nothing while disabled (signed out or no business yet)', async () => {
    await act(async () => {
      renderer.create(<Probe enabled={false} />);
    });
    expect(mockMint).not.toHaveBeenCalled();
  });
});
