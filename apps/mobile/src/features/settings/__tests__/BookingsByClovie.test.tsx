import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/lib/i18n';
import { qk } from '@/lib/query';
import { flush as flushMicrotasks, text } from '@/testing/render';

import { BookingsByClovieSection } from '../components/BookingsByClovieSection';
import {
  applyPatch,
  revertPatch,
  UNDO_WINDOW_OPTIONS,
} from '../companionSettings';

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

let mockRole: 'owner' | 'staff' | undefined = 'owner';
jest.mock('@/features/business/me', () => ({
  useMe: () => ({ data: mockRole ? { role: mockRole } : undefined }),
}));

const mockGet = jest.fn();
const mockPatch = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  newIdempotencyKey: () => 'key-1',
  api: {
    companionSettings: (...a: unknown[]) => mockGet(...a),
    updateCompanionSettings: (...a: unknown[]) => mockPatch(...a),
  },
}));

const mockFailed = jest.fn();
jest.mock('@/lib/toast', () => ({
  toast: {
    failed: (...a: unknown[]) => mockFailed(...a),
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const SETTINGS = {
  approvalPolicy: 'risky_only' as const,
  undoWindowSeconds: 30,
  updatedAt: null,
};

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

let client: QueryClient;
const trees: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
  client.clear();
});

/** Query results and mutations settle on timers as well as promises. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await flushMicrotasks();
}

async function show(): Promise<ReactTestRenderer> {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { gcTime: 0 } },
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <BookingsByClovieSection />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  trees.push(tree);
  // Wait for the section to leave its loading state (a tick is not always enough under load).
  for (let i = 0; i < 50 && mockRole === 'owner'; i++) {
    await flush();
    if (
      byId(tree, 'bookings-policy-hint').length > 0 ||
      byId(tree, 'bookings-unavailable').length > 0
    ) {
      break;
    }
  }
  return tree;
}

const byLabel = (tree: ReactTestRenderer, prefix: string) =>
  tree.root.find(
    (n) =>
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(prefix) &&
      !!n.props.onPress,
  );

const byId = (tree: ReactTestRenderer, id: string) =>
  tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

const cached = () => client.getQueryData<typeof SETTINGS>(qk.companionSettings);

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'owner';
  mockGet.mockResolvedValue(SETTINGS);
  mockPatch.mockImplementation(async (patch: object) => ({
    ...SETTINGS,
    ...patch,
  }));
});

describe('Bookings by Clovie: who sees it', () => {
  it('is shown to the owner', async () => {
    const tree = await show();
    expect(byId(tree, 'bookings-by-clovie')).toHaveLength(1);
    expect(text(tree)).toContain('Bookings by Clovie');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('shows staff the same rows dimmed with the reason, and never asks for the settings', async () => {
    mockRole = 'staff';
    const tree = await show();
    expect(byId(tree, 'bookings-by-clovie')).toHaveLength(1);
    expect(byId(tree, 'bookings-unavailable')).toHaveLength(1);
    const copy = text(tree);
    expect(copy).toContain('Ask me first');
    expect(copy).toContain('Time to undo');
    expect(copy).toContain('Owner only');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('waits for the role before saying anything about it', async () => {
    mockRole = undefined;
    const tree = await show();
    expect(byId(tree, 'bookings-unavailable')).toHaveLength(0);
    expect(text(tree)).not.toContain('Owner only');
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('Bookings by Clovie: ask me first', () => {
  it('lists the three choices, marks the recommended one and explains the selected one', async () => {
    const tree = await show();
    const copy = text(tree);
    expect(copy).toContain('Ask me first');
    expect(copy).toContain('Every change');
    expect(copy).toContain('Only risky changes');
    expect(copy).toContain('Never');
    expect(copy).toContain('Recommended');
    expect(
      text({ root: byId(tree, 'bookings-policy-hint')[0]! } as never),
    ).toBe(
      'Clovie books simple appointments right away and asks before moving, cancelling or anything unclear.',
    );
  });

  it('gives every choice its one-line explanation to a screen reader', async () => {
    const tree = await show();
    expect(byLabel(tree, 'Every change').props.accessibilityLabel).toBe(
      'Every change. Clovie asks before booking, moving or cancelling.',
    );
    expect(byLabel(tree, 'Never').props.accessibilityLabel).toBe(
      'Never. Clovie acts straight away; you can still undo for a short time.',
    );
  });

  it('saves a choice at once and sends it with an Idempotency-Key', async () => {
    const tree = await show();
    act(() => byLabel(tree, 'Every change').props.onPress());
    // Optimistic: the cache already holds the new value before the server answers.
    expect(cached()?.approvalPolicy).toBe('always');
    await flush();
    expect(mockPatch).toHaveBeenCalledTimes(1);
    const [body, key] = mockPatch.mock.calls[0]!;
    expect(body).toEqual({ approvalPolicy: 'always' });
    expect(key).toBe('key-1');
    expect(cached()?.approvalPolicy).toBe('always');
    expect(text(tree)).toContain(
      'Clovie asks before booking, moving or cancelling.',
    );
  });

  it('rolls the choice back and says so when the save fails', async () => {
    mockPatch.mockRejectedValue({ code: 'UPSTREAM_ERROR', status: 502 });
    const tree = await show();
    act(() => byLabel(tree, 'Never').props.onPress());
    expect(cached()?.approvalPolicy).toBe('never');
    await flush();
    expect(cached()?.approvalPolicy).toBe('risky_only');
    expect(mockFailed).toHaveBeenCalledWith(
      'Could not save. Try again.',
      expect.anything(),
    );
  });
});

describe('Bookings by Clovie: time to undo', () => {
  it('offers Off, 15, 30, 60 and 120 seconds with the current one selected', async () => {
    const tree = await show();
    const radios = tree.root.findAll(
      (n) => n.props.accessibilityRole === 'radio' && !!n.props.onPress,
    );
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      'Off',
      '15s',
      '30s',
      '60s',
      '120s',
    ]);
    expect(
      radios.find((r) => r.props.accessibilityState?.selected)?.props
        .accessibilityLabel,
    ).toBe('30s');
  });

  it('saves the new window, with 0 for Off', async () => {
    const tree = await show();
    act(() => byLabel(tree, 'Off').props.onPress());
    expect(cached()?.undoWindowSeconds).toBe(0);
    await flush();
    expect(mockPatch.mock.calls[0]![0]).toEqual({ undoWindowSeconds: 0 });
  });

  it('rolls the window back when the save fails, leaving the other field alone', async () => {
    mockPatch.mockRejectedValue({ code: 'NETWORK_ERROR', status: 0 });
    const tree = await show();
    act(() => byLabel(tree, '60s').props.onPress());
    expect(cached()?.undoWindowSeconds).toBe(60);
    await flush();
    expect(cached()).toMatchObject({
      undoWindowSeconds: 30,
      approvalPolicy: 'risky_only',
    });
  });

  it('shows a window set elsewhere that is not one of the five', async () => {
    mockGet.mockResolvedValue({ ...SETTINGS, undoWindowSeconds: 45 });
    const tree = await show();
    expect(text(tree)).toContain('45s');
  });
});

describe('Bookings by Clovie: not available yet', () => {
  it('stays, disabled, when the settings cannot be read', async () => {
    mockGet.mockRejectedValue({ code: 'UPSTREAM_ERROR', status: 502 });
    const tree = await show();
    expect(text(tree)).toContain('Bookings by Clovie');
    expect(byId(tree, 'bookings-unavailable')).toHaveLength(1);
    expect(text(tree)).toContain('Not available yet');
    expect(
      tree.root.findAll(
        (n) => n.props.accessibilityRole === 'radio' && !!n.props.onPress,
      ),
    ).toHaveLength(0);
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('companionSettings helpers', () => {
  it('offers the five windows, Off first', () => {
    expect([...UNDO_WINDOW_OPTIONS]).toEqual([0, 15, 30, 60, 120]);
  });

  it('applies a patch and reverts only the fields it touched', () => {
    const next = applyPatch(SETTINGS, { undoWindowSeconds: 0 });
    expect(next).toEqual({ ...SETTINGS, undoWindowSeconds: 0 });
    expect(revertPatch(SETTINGS, { undoWindowSeconds: 0 })).toEqual({
      undoWindowSeconds: 30,
    });
    expect(revertPatch(SETTINGS, { approvalPolicy: 'never' })).toEqual({
      approvalPolicy: 'risky_only',
    });
  });
});
