import * as React from 'react';

import { ApiError } from '@/lib/api';
import { act, flush, mount, pressableByText, text } from '@/testing/render';

import { ConnectWhatsAppCard } from '../components/ConnectWhatsAppCard';

const LAUNCH_URL = 'https://connect.nerova.example/launch/SECRET-LAUNCH-TOKEN';

const mockMe = jest.fn();
const mockSetup = jest.fn();
const mockConnect = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  newIdempotencyKey: () => 'key-' + Math.random(),
  api: {
    me: () => mockMe(),
    companionSetup: () => mockSetup(),
    createCompanionWhatsAppSession: (...args: unknown[]) =>
      mockConnect(...args),
  },
}));
const mockOpenBrowser = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));
const mockSuccess = jest.fn();
jest.mock('@booking/ui', () => {
  const actual = jest.requireActual('@booking/ui');
  return {
    ...actual,
    haptics: {
      ...actual.haptics,
      light: jest.fn(),
      success: () => mockSuccess(),
    },
  };
});

const spies = ['log', 'info', 'warn', 'error', 'debug'].map((k) =>
  jest.spyOn(console, k as 'log').mockImplementation(() => {}),
);

const setupDto = (next_step: string, connected = false) => ({
  next_step,
  whatsapp: {
    connected,
    state: connected ? 'live' : 'none',
    display_phone_number: connected ? '+27 82 123 4567' : null,
    business_verified: connected,
  },
  companion_live: false,
});

const session = () => ({
  launch_url: LAUNCH_URL,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
});

/** React Query notifies on a timer, so let it run under fake timers. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      jest.advanceTimersByTime(10);
    });
    await flush();
  }
}

async function press(tree: ReturnType<typeof mount>, label: string) {
  await act(async () => pressableByText(tree, label).props.onPress());
  await settle();
}

beforeEach(() => {
  jest.useFakeTimers();
  mockMe.mockReset().mockResolvedValue({ role: 'owner' });
  mockSetup.mockReset();
  mockConnect.mockReset();
  mockOpenBrowser.mockReset().mockResolvedValue({ type: 'dismiss' });
  mockSuccess.mockReset();
  spies.forEach((s) => s.mockClear());
});
afterEach(() => jest.useRealTimers());

describe('ConnectWhatsAppCard', () => {
  it('shows nothing to staff and never asks for setup', async () => {
    mockMe.mockResolvedValue({ role: 'staff' });
    mockSetup.mockResolvedValue(setupDto('connect_whatsapp'));
    const tree = mount(<ConnectWhatsAppCard />);
    await settle();
    expect(text(tree)).not.toContain('Connect WhatsApp');
    expect(mockSetup).not.toHaveBeenCalled();
  });

  it('shows nothing when the next step is something else', async () => {
    mockSetup.mockResolvedValue(setupDto('go_live', true));
    const tree = mount(<ConnectWhatsAppCard />);
    await settle();
    expect(text(tree)).toBe('');
  });

  it('opens the launch URL in the browser tab, then shows success and reloads the chat', async () => {
    mockSetup.mockResolvedValue(setupDto('connect_whatsapp'));
    mockConnect.mockResolvedValue(session());
    const onConnected = jest.fn();
    const tree = mount(<ConnectWhatsAppCard onConnected={onConnected} />);
    await settle();
    expect(text(tree)).toContain(
      'Connect WhatsApp so Clovie can message your clients',
    );

    await press(tree, 'Connect WhatsApp');
    expect(mockConnect).toHaveBeenCalledWith(expect.any(String));
    expect(mockOpenBrowser).toHaveBeenCalledWith(LAUNCH_URL);
    expect(text(tree)).toContain('Finish connecting in your browser');
    expect(onConnected).not.toHaveBeenCalled();

    mockSetup.mockResolvedValue(setupDto('go_live', true));
    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    await settle();
    expect(text(tree)).toContain('WhatsApp connected · +27 ••• ••• 567');
    expect(text(tree)).not.toContain('4567');
    expect(mockSuccess).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(text(tree)).toBe('');
    expect(JSON.stringify(spies.map((s) => s.mock.calls))).not.toContain(
      'SECRET-LAUNCH',
    );
  });

  it('goes straight to success when WhatsApp is already connected', async () => {
    mockSetup.mockResolvedValue(setupDto('connect_whatsapp'));
    mockConnect.mockRejectedValue(
      new ApiError({
        code: 'WHATSAPP_ALREADY_CONNECTED',
        message: 'x',
        status: 409,
      }),
    );
    const tree = mount(<ConnectWhatsAppCard />);
    await settle();
    await press(tree, 'Connect WhatsApp');
    expect(text(tree)).toContain('WhatsApp connected');
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });

  it('explains a failure and retries', async () => {
    mockSetup.mockResolvedValue(setupDto('connect_whatsapp'));
    mockConnect.mockRejectedValueOnce(
      new ApiError({
        code: 'COMPANION_NOT_READY',
        message: 'not ready',
        status: 409,
      }),
    );
    const tree = mount(<ConnectWhatsAppCard />);
    await settle();
    await press(tree, 'Connect WhatsApp');
    expect(text(tree)).toContain("Couldn't start connecting");

    mockConnect.mockResolvedValue(session());
    await press(tree, 'Try again');
    expect(mockOpenBrowser).toHaveBeenCalledWith(LAUNCH_URL);
  });

  it('stops polling after three minutes and offers to connect again', async () => {
    mockSetup.mockResolvedValue(setupDto('connect_whatsapp'));
    mockConnect.mockResolvedValue(session());
    mockOpenBrowser.mockReturnValue(new Promise(() => {}));
    const tree = mount(<ConnectWhatsAppCard />);
    await settle();
    await press(tree, 'Connect WhatsApp');
    for (let i = 0; i < 61; i++) {
      await act(async () => {
        jest.advanceTimersByTime(3_000);
      });
    }
    await settle();
    const calls = mockSetup.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await settle();
    expect(mockSetup.mock.calls.length).toBe(calls);
    expect(text(tree)).toContain('Connect WhatsApp');
    expect(text(tree)).not.toContain('Finish connecting');
  });
});
