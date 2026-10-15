import * as React from 'react';

import { ApiError } from '@/lib/api';
import { act, flush, mount, pressableByText, text } from '@/testing/render';

import { CompanionContent } from '../components/CompanionContent';

const SECRET_URL = 'https://chat.nerova.example/s/SECRET-TOKEN-123';

const mockCreate = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  newIdempotencyKey: () => 'key-' + Math.random(),
  api: { createCompanionSession: (...args: unknown[]) => mockCreate(...args) },
}));
jest.mock('@/lib/env', () => ({
  companionOrigin: 'https://app.example.com',
  env: { apiUrl: 'https://app.example.com' },
}));

let mockLastWebView: {
  source: { html: string; baseUrl: string };
  onMessage: (e: { nativeEvent: { data: string } }) => void;
} | null = null;
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: (props: typeof mockLastWebView) => {
      mockLastWebView = props;
      return <View testID="companion-webview" />;
    },
  };
});

function webviews(tree: ReturnType<typeof mount>) {
  return tree.root.findAll(
    (n) => typeof n.type === 'string' && n.props.testID === 'companion-webview',
  );
}

/** Moves the clock in small steps, letting promises settle between them (the mint retries on a timer). */
async function advance(ms: number) {
  const step = ms >= 60_000 ? 10_000 : 500;
  for (let t = 0; t < ms; t += step) {
    await act(async () => {
      jest.advanceTimersByTime(Math.min(step, ms - t));
    });
    await flush();
  }
}

function session(url = SECRET_URL, minutes = 15) {
  return {
    url,
    expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
  };
}

function notReady(details: Record<string, unknown>) {
  return new ApiError({
    code: 'COMPANION_NOT_READY',
    message: 'not ready',
    status: 409,
    details,
  });
}

const spies = ['log', 'info', 'warn', 'error', 'debug'].map((k) =>
  jest.spyOn(console, k as 'log').mockImplementation(() => {}),
);

// Fake timers: the mint retries a failed request with a delay, and the session refreshes on a timer.
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCreate.mockReset();
  mockLastWebView = null;
});
afterEach(() => {
  jest.useRealTimers();
});

describe('CompanionContent', () => {
  it('shows a shimmer while the session is minted, then the chat in a WebView', async () => {
    let resolve!: (s: ReturnType<typeof session>) => void;
    mockCreate.mockReturnValue(new Promise((r) => (resolve = r)));
    const tree = mount(<CompanionContent />);
    expect(
      tree.root.findAll(
        (n) => n.props.accessibilityLabel === 'Getting your companion ready',
      ).length,
    ).toBeGreaterThan(0);

    await act(async () => resolve(session()));
    expect(webviews(tree)).toHaveLength(1);
    // Served from the allowlisted origin, with the session framed inside.
    expect(mockLastWebView?.source.baseUrl).toBe('https://app.example.com');
    expect(mockLastWebView?.source.html).toContain(SECRET_URL);
  });

  it('asks for a session in the current colour mode with an idempotency key', async () => {
    mockCreate.mockResolvedValue(session());
    mount(<CompanionContent />);
    await flush();
    expect(mockCreate).toHaveBeenCalledWith(
      { color_mode: 'light' },
      expect.any(String),
    );
  });

  it.each([
    [{ reason: 'account_not_found' }, 'Your companion is being set up'],
    [{ reason: 'setup_incomplete' }, 'Finish setting up your companion'],
    [{ reason: 'unavailable' }, 'Your companion is unavailable right now'],
    [
      { reason: 'setup_incomplete', next_step: 'connect_whatsapp' },
      'Connect WhatsApp to go live',
    ],
    [{ reason: 'not_provisioned' }, 'Your companion is being set up'],
  ])('explains COMPANION_NOT_READY %j', async (details, title) => {
    mockCreate.mockRejectedValue(notReady(details));
    const tree = mount(<CompanionContent />);
    await flush();
    expect(text(tree)).toContain(title);
    expect(webviews(tree)).toHaveLength(0);
  });

  it('offers a retry when Nerova fails, and tries again', async () => {
    const bad = new ApiError({
      code: 'UPSTREAM_COMPANION_ERROR',
      message: 'bad gateway',
      status: 502,
      requestId: 'req_1',
    });
    // The first attempt and its two automatic retries fail; the owner's retry works.
    mockCreate
      .mockRejectedValueOnce(bad)
      .mockRejectedValueOnce(bad)
      .mockRejectedValueOnce(bad)
      .mockResolvedValue(session());
    const tree = mount(<CompanionContent />);
    await flush();
    await advance(5000);
    expect(text(tree)).toContain("Your companion isn't reachable");
    expect(text(tree)).toContain('req_1');
    await act(async () => pressableByText(tree, 'Try again').props.onPress());
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(4);
    expect(webviews(tree)).toHaveLength(1);
  });

  it('mints a new session a minute before expiry and swaps the URL', async () => {
    mockCreate
      .mockResolvedValueOnce(session('https://chat.example/one', 15))
      .mockResolvedValueOnce(session('https://chat.example/two', 15));
    mount(<CompanionContent />);
    await flush();
    expect(mockLastWebView?.source.html).toContain('chat.example/one');

    await advance(13 * 60_000);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    await advance(60_000 + 1000);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockLastWebView?.source.html).toContain('chat.example/two');
  });

  it('keeps the working chat when an early refresh fails, and retries', async () => {
    const down = new ApiError({
      code: 'NETWORK_ERROR',
      message: 'x',
      status: 0,
    });
    mockCreate
      .mockResolvedValueOnce(session('https://chat.example/one', 15))
      .mockRejectedValueOnce(down)
      .mockRejectedValueOnce(down)
      .mockRejectedValueOnce(down)
      .mockResolvedValueOnce(session('https://chat.example/two', 15));
    const tree = mount(<CompanionContent />);
    await flush();
    await advance(14 * 60_000 + 1000);
    await advance(5000);
    expect(webviews(tree)).toHaveLength(1);
    await advance(31_000);
    expect(mockLastWebView?.source.html).toContain('chat.example/two');
  });

  it('mints a new session when the frame reports session_expired', async () => {
    mockCreate
      .mockResolvedValueOnce(session('https://chat.example/one'))
      .mockResolvedValueOnce(session('https://chat.example/two'));
    mount(<CompanionContent />);
    await flush();
    await act(async () =>
      mockLastWebView?.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'nerova:widget',
            event: 'error',
            reason: 'session_expired',
          }),
        },
      }),
    );
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockLastWebView?.source.html).toContain('chat.example/two');
  });

  it('never logs the session URL', async () => {
    mockCreate.mockResolvedValueOnce(session()).mockRejectedValue(
      new ApiError({
        code: 'UPSTREAM_COMPANION_ERROR',
        message: 'x',
        status: 502,
      }),
    );
    const tree = mount(<CompanionContent />);
    await flush();
    await act(async () =>
      mockLastWebView?.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'nerova:widget',
            event: 'error',
            reason: 'session_expired',
          }),
        },
      }),
    );
    await advance(5000);
    expect(text(tree)).toContain("isn't reachable");
    expect(text(tree)).not.toContain('SECRET-TOKEN-123');
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-TOKEN-123');
    }
  });
});
