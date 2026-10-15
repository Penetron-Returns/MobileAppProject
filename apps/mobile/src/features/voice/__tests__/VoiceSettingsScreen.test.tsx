import { Alert } from 'react-native';

import { act, flush, mount, text } from '@/testing/render';

import { VoiceSettingsScreen } from '../components/VoiceSettingsScreen';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  usePathname: () => '/settings/voice',
}));

type VoiceState = {
  status: string;
  error: string | null;
  wakePhrase: string;
};
const mockNative = {
  state: { status: 'off', error: null, wakePhrase: 'Hey Clovie' } as VoiceState,
  listener: null as null | ((s: VoiceState) => void),
  start: jest.fn(),
  stop: jest.fn(),
  canOverlay: true,
  requestOverlay: jest.fn(),
};
jest.mock('../clovieVoice', () => ({
  isSupported: () => true,
  canDrawOverlays: () => mockNative.canOverlay,
  requestOverlayPermission: () => mockNative.requestOverlay(),
  getStatus: () => mockNative.state,
  start: (...args: unknown[]) => mockNative.start(...args),
  stop: () => mockNative.stop(),
  addStatusListener: (cb: (s: VoiceState) => void) => {
    mockNative.listener = cb;
    return () => {
      mockNative.listener = null;
    };
  },
}));

const mockPermissions = jest.fn();
jest.mock('../permissions', () => ({
  requestVoicePermissions: () => mockPermissions(),
}));

const mockStorage = jest.requireMock(
  '@react-native-async-storage/async-storage',
) as { setItem: jest.Mock };

function toggle(tree: ReturnType<typeof mount>) {
  return tree.root.find(
    (n) =>
      n.props.accessibilityLabel === 'Hey Clovie' &&
      typeof n.props.onCheckedChange === 'function',
  );
}

/** Taps the "Allow" button of the consent dialog the toggle opens. */
async function allow() {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as {
    text: string;
    onPress?: () => void;
  }[];
  await act(async () => buttons.find((b) => b.text === 'Allow')?.onPress?.());
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockNative.state = { status: 'off', error: null, wakePhrase: 'Hey Clovie' };
  mockNative.listener = null;
  mockNative.canOverlay = true;
  mockNative.start.mockImplementation(async () => ({
    ...mockNative.state,
    status: 'starting',
  }));
  mockNative.stop.mockImplementation(() => ({
    ...mockNative.state,
    status: 'off',
  }));
  mockPermissions.mockResolvedValue(true);
});

describe('VoiceSettingsScreen', () => {
  it('is off by default and explains what the microphone does', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    const out = text(tree);
    expect(out).toContain('Off');
    expect(out).toContain('Nothing is recorded, saved or sent anywhere');
    expect(toggle(tree).props.checked).toBe(false);
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('asks for consent, then permissions, then starts the service', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree).props.onCheckedChange(true));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockPermissions).not.toHaveBeenCalled();
    await allow();

    expect(mockPermissions).toHaveBeenCalledTimes(1);
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'pref.heyClovieEnabled',
      'true',
    );
  });

  it('shows listening when the service reports it, and Stop turns it off', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() =>
      mockNative.listener?.({
        status: 'listening',
        error: null,
        wakePhrase: 'Hey Clovie',
      }),
    );
    expect(text(tree)).toContain('Listening for "Hey Clovie"');
    expect(toggle(tree).props.checked).toBe(true);

    act(() => toggle(tree).props.onCheckedChange(false));
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
    expect(mockStorage.setItem).toHaveBeenCalledWith(
      'pref.heyClovieEnabled',
      'false',
    );
  });

  it('sends the owner to system settings for the overlay when it is not granted', async () => {
    mockNative.canOverlay = false;
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    expect(text(tree)).toContain(
      'Clovie will answer with a notification instead',
    );
    act(() => toggle(tree).props.onCheckedChange(true));
    await allow();
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.requestOverlay).toHaveBeenCalledTimes(1);
  });

  it('does not start when a permission is denied and offers the phone settings', async () => {
    mockPermissions.mockResolvedValue(false);
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree).props.onCheckedChange(true));
    await allow();

    expect(mockNative.start).not.toHaveBeenCalled();
    expect(text(tree)).toContain('Open settings');
    expect(toggle(tree).props.checked).toBe(false);
  });

  it('reports a build without the wake-word models and disables the switch', async () => {
    mockNative.state = {
      status: 'not_configured',
      error: null,
      wakePhrase: 'Hey Clovie',
    };
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    expect(text(tree)).toContain('Not set up in this build');
    expect(toggle(tree).props.disabled).toBe(true);
  });

  it('shows what went wrong in words', async () => {
    mockNative.state = {
      status: 'error',
      error: 'background_start_blocked',
      wakePhrase: 'Hey Clovie',
    };
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    expect(text(tree)).toContain(
      'only lets Hey Clovie start while the app is open',
    );
  });
});
