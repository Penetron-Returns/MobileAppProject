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
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({ data: { timezone: 'Africa/Johannesburg' } }),
}));
jest.mock('../scheduleSync', () => ({ useVoiceScheduleSync: jest.fn() }));

type VoiceState = {
  status: string;
  error: string | null;
  wakePhrase: string;
};
type HandsFree = {
  enabled: boolean;
  useOpeningHours: boolean;
  onlyWhileCharging: boolean;
  duty: string;
  untilMs: number | null;
  windowsUntilMs: number | null;
};

const OFF: HandsFree = {
  enabled: false,
  useOpeningHours: true,
  onlyWhileCharging: false,
  duty: 'stopped',
  untilMs: null,
  windowsUntilMs: null,
};

const mockNative = {
  state: { status: 'off', error: null, wakePhrase: 'Hey Clovie' } as VoiceState,
  handsFree: OFF,
  start: jest.fn(),
  stop: jest.fn(),
  startTalk: jest.fn(),
  configure: jest.fn(),
  canOverlay: true,
  requestOverlay: jest.fn(),
  requestAddTile: jest.fn(),
  setLauncherIcon: jest.fn(),
  launcherIcon: false,
  feedback: { sounds: true, readAloud: true },
  setSounds: jest.fn(),
  setReadAloud: jest.fn(),
};
jest.mock('../clovieVoice', () => ({
  isSupported: () => true,
  getStatus: () => mockNative.state,
  getHandsFree: () => mockNative.handsFree,
  configureHandsFree: (...args: unknown[]) => mockNative.configure(...args),
  start: (...args: unknown[]) => mockNative.start(...args),
  stop: () => mockNative.stop(),
  startTalk: () => mockNative.startTalk(),
  canDrawOverlays: () => mockNative.canOverlay,
  requestOverlayPermission: () => mockNative.requestOverlay(),
  requestAddTile: () => mockNative.requestAddTile(),
  setLauncherIconEnabled: (on: boolean) => mockNative.setLauncherIcon(on),
  isLauncherIconEnabled: () => mockNative.launcherIcon,
  getFeedbackSettings: () => mockNative.feedback,
  setSoundsEnabled: (on: boolean) => mockNative.setSounds(on),
  setReadAloudEnabled: (on: boolean) => mockNative.setReadAloud(on),
  addStatusListener: () => () => undefined,
}));

const mockPermissions = jest.fn();
jest.mock('../permissions', () => ({
  requestVoicePermissions: () => mockPermissions(),
}));

function toggle(tree: ReturnType<typeof mount>, label: string) {
  return tree.root.find(
    (n) =>
      n.props.accessibilityLabel === label &&
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
  mockNative.handsFree = OFF;
  mockNative.canOverlay = true;
  mockNative.launcherIcon = false;
  mockNative.feedback = { sounds: true, readAloud: true };
  mockNative.setSounds.mockImplementation((on: boolean) => {
    mockNative.feedback = { ...mockNative.feedback, sounds: on };
  });
  mockNative.setReadAloud.mockImplementation((on: boolean) => {
    mockNative.feedback = { ...mockNative.feedback, readAloud: on };
  });
  mockNative.start.mockImplementation(async () => {
    mockNative.handsFree = { ...OFF, enabled: true, duty: 'on_duty' };
    return { ...mockNative.state, status: 'starting' };
  });
  mockNative.stop.mockImplementation(() => {
    mockNative.handsFree = OFF;
    return { ...mockNative.state, status: 'off' };
  });
  mockNative.startTalk.mockResolvedValue(mockNative.state);
  mockNative.requestAddTile.mockResolvedValue('added');
  mockPermissions.mockResolvedValue(true);
});

describe('one-tap section', () => {
  it('explains the tile, widget, shortcut and side key', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    const out = text(tree);
    for (const line of [
      'Talk to Clovie',
      'Quick Settings tile',
      'Home screen button',
      'App icon shortcut',
      'Show a Clovie Voice icon',
      'Try it now',
      'open only while you speak',
    ]) {
      expect(out).toContain(line);
    }
  });

  it('turns the second launcher icon on for the side key', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() =>
      toggle(tree, 'Show a Clovie Voice icon').props.onCheckedChange(true),
    );
    expect(mockNative.setLauncherIcon).toHaveBeenCalledWith(true);
  });

  it('asks permission, then listens once when the owner taps Try it now', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    const row = tree.root.find(
      (n) => !!n.props.onPress && n.props.accessibilityLabel === 'Try it now',
    );
    await act(async () => row.props.onPress());
    await flush();
    expect(mockPermissions).toHaveBeenCalledTimes(1);
    expect(mockNative.startTalk).toHaveBeenCalledTimes(1);
  });
});

describe('replies section', () => {
  it('has sounds and read-aloud on by default', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    expect(toggle(tree, 'Sounds').props.checked).toBe(true);
    expect(toggle(tree, 'Read replies aloud').props.checked).toBe(true);
  });

  it('saves each choice natively and shows it', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree, 'Read replies aloud').props.onCheckedChange(false));
    act(() => toggle(tree, 'Sounds').props.onCheckedChange(false));
    expect(mockNative.setReadAloud).toHaveBeenCalledWith(false);
    expect(mockNative.setSounds).toHaveBeenCalledWith(false);
    expect(toggle(tree, 'Read replies aloud').props.checked).toBe(false);
    expect(toggle(tree, 'Sounds').props.checked).toBe(false);
  });
});

describe('hands-free section', () => {
  it('is off by default and says what the microphone does', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    const out = text(tree);
    expect(out).toContain('Off');
    expect(out).toContain('Nothing is recorded or sent');
    expect(toggle(tree, 'Hey Clovie').props.checked).toBe(false);
    // The conditions are always listed; they are dimmed, with the reason, until Hey Clovie is on.
    expect(out).toContain('When to listen');
    expect(out).toContain('Only during opening hours');
    expect(out).toContain('Only while charging');
    expect(out).toContain('Turn on Hey Clovie to choose when it listens.');
    expect(
      tree.root.findAll(
        (n) =>
          n.props.accessibilityLabel === 'Only while charging' &&
          n.props.accessibilityState?.disabled === true,
      ).length,
    ).toBeGreaterThan(0);
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('asks for consent, then permissions, then starts the service', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree, 'Hey Clovie').props.onCheckedChange(true));

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(mockPermissions).not.toHaveBeenCalled();
    await allow();

    expect(mockPermissions).toHaveBeenCalledTimes(1);
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(toggle(tree, 'Hey Clovie').props.checked).toBe(true);
    // The conditions appear once it is on: opening hours by default.
    expect(text(tree)).toContain('When to listen');
    expect(toggle(tree, 'Only during opening hours').props.checked).toBe(true);
    expect(toggle(tree, 'Only while charging').props.checked).toBe(false);
  });

  it('opens with a two-sentence disclosure and keeps the full text behind Read more', async () => {
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree, 'Hey Clovie').props.onCheckedChange(true));

    const [, short, firstButtons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(short).toBe(
      'Hey Clovie listens through your microphone, even when Clovie is closed. Nothing is recorded until you say Hey Clovie.',
    );
    expect(firstButtons.map((b: { text: string }) => b.text)).toEqual([
      'Cancel',
      'Read more',
      'Allow',
    ]);
    act(() =>
      firstButtons
        .find((b: { text: string }) => b.text === 'Read more')
        .onPress(),
    );
    const [, full, fullButtons] = (Alert.alert as jest.Mock).mock.calls[1];
    expect(full).toContain('uses your microphone to listen on this phone');
    expect(full).toContain('Nothing is recorded or sent while it waits');
    expect(fullButtons.map((b: { text: string }) => b.text)).toEqual([
      'Cancel',
      'Allow',
    ]);
    expect(mockPermissions).not.toHaveBeenCalled();
  });

  it('shows on duty until closing time in the business timezone', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-15T08:00:00Z'));
    mockNative.handsFree = {
      ...OFF,
      enabled: true,
      duty: 'on_duty',
      untilMs: Date.parse('2026-10-15T16:00:00Z'), // 18:00 in Johannesburg
    };
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    expect(text(tree)).toContain('On duty until 18:00');
    jest.restoreAllMocks();
  });

  it.each([
    ['off_hours', Date.parse('2099-01-05T06:00:00Z'), 'Off until opening at'],
    ['waiting_charger', null, 'Waiting for the charger'],
    ['paused', Date.parse('2099-01-05T06:00:00Z'), 'Paused until'],
  ])('shows the %s state', async (duty, untilMs, expected) => {
    mockNative.handsFree = { ...OFF, enabled: true, duty, untilMs };
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    expect(text(tree)).toContain(expected);
  });

  it('changes the conditions natively', async () => {
    mockNative.handsFree = { ...OFF, enabled: true, duty: 'on_duty' };
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree, 'Only while charging').props.onCheckedChange(true));
    expect(mockNative.configure).toHaveBeenCalledWith({
      onlyWhileCharging: true,
    });
    act(() =>
      toggle(tree, 'Only during opening hours').props.onCheckedChange(false),
    );
    expect(mockNative.configure).toHaveBeenCalledWith({
      useOpeningHours: false,
    });
  });

  it('turns it off', async () => {
    mockNative.handsFree = { ...OFF, enabled: true, duty: 'on_duty' };
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree, 'Hey Clovie').props.onCheckedChange(false));
    expect(mockNative.stop).toHaveBeenCalledTimes(1);
  });

  it('does not start when a permission is denied and offers the phone settings', async () => {
    mockPermissions.mockResolvedValue(false);
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    act(() => toggle(tree, 'Hey Clovie').props.onCheckedChange(true));
    await allow();

    expect(mockNative.start).not.toHaveBeenCalled();
    expect(text(tree)).toContain('Open settings');
    expect(toggle(tree, 'Hey Clovie').props.checked).toBe(false);
  });

  it('sends the owner to system settings for the overlay when it is not granted', async () => {
    mockNative.canOverlay = false;
    const tree = mount(<VoiceSettingsScreen />);
    await flush();
    expect(text(tree)).toContain(
      'Clovie will answer with a notification instead',
    );
    act(() => toggle(tree, 'Hey Clovie').props.onCheckedChange(true));
    await allow();
    expect(mockNative.start).toHaveBeenCalledTimes(1);
    expect(mockNative.requestOverlay).toHaveBeenCalledTimes(1);
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
    expect(toggle(tree, 'Hey Clovie').props.disabled).toBe(true);
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
