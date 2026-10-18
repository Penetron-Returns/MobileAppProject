import '@/lib/i18n';

import * as React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CompanionSettingsScreen } from '../components/CompanionSettingsScreen';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Redirect: () => null,
}));

const mockOpenChat = jest.fn();
jest.mock('@/features/companion/sdk/useOpenCompanion', () => ({
  useOpenCompanion: () => mockOpenChat,
}));

const mockSetup = {
  isPending: false,
  isError: false,
  data: {
    next_step: 'none',
    companion_live: true,
    whatsapp: {
      connected: true,
      state: 'connected',
      display_phone_number: '+27821234567',
      business_verified: true,
    },
  },
  refetch: jest.fn(),
};
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => mockSetup,
}));

let mockRole: 'owner' | 'staff' = 'owner';
jest.mock('@/features/business/me', () => ({
  useMe: () => ({
    data: { role: mockRole, business: { attendance_mode: 'staff' } },
  }),
  useCanManage: () => mockRole !== 'staff',
}));

let mockVoiceSupported = true;
jest.mock('@/features/voice/clovieVoice', () => ({
  isSupported: () => mockVoiceSupported,
}));
let mockVoiceOn = false;
jest.mock('@/features/voice/hooks', () => ({
  useHeyClovieOn: () => mockVoiceOn,
}));

// Its own test file covers it; here it only needs to be on the screen.
jest.mock('../components/BookingsByClovieSection', () => {
  const { View } = require('react-native');
  return { BookingsByClovieSection: () => <View testID="bookings-section" /> };
});

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <CompanionSettingsScreen />
      </SafeAreaProvider>,
    );
  });
  return tree;
}

function text(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const visit = (node: ReactTestInstance | string) => {
    if (typeof node === 'string') parts.push(node);
    else node.children.forEach(visit);
  };
  visit(tree.root);
  return parts.join(' | ');
}

const row = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) =>
      typeof n.props.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.startsWith(label) &&
      !!n.props.onPress,
  )[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'owner';
  mockVoiceSupported = true;
  mockVoiceOn = false;
});

it('shows the Bookings by Clovie section below the companion settings', () => {
  const tree = mount();
  expect(
    tree.root.findAll((n) => n.props.testID === 'bookings-section'),
  ).not.toHaveLength(0);
});

describe('Clovie screen', () => {
  it('shows the status and every Clovie setting on one screen', () => {
    const out = text(mount());
    expect(out).toContain('Status');
    expect(out).toContain('Live');
    expect(out).toContain('Who confirms attendance');
    expect(out).toContain('Staff');
    expect(out).toContain('Clovie voice');
    expect(out).toContain('Off');
    expect(out).toContain('Open chat');
    // Ask first and time to undo come from the Bookings by Clovie section.
    expect(
      mount().root.findAll((n) => n.props.testID === 'bookings-section'),
    ).not.toHaveLength(0);
  });

  it('opens the attendance picker and the voice screen from rows with values', () => {
    const tree = mount();
    act(() => row(tree, 'Clovie voice')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/voice');
    act(() => row(tree, 'Who confirms attendance')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/attendance');
  });

  it('opens the chat from an action button, not a navigation row', () => {
    const tree = mount();
    act(() => row(tree, 'Open chat')?.props.onPress());
    expect(mockOpenChat).toHaveBeenCalledTimes(1);
  });

  it('keeps the voice row, dimmed with its reason, where voice is not supported', () => {
    mockVoiceSupported = false;
    const tree = mount();
    expect(text(tree)).toContain('Clovie voice');
    expect(text(tree)).toContain('Available on Android');
    expect(row(tree, 'Clovie voice')).toBeUndefined();
  });

  it('shows staff every row read-only, with the owner-only note', () => {
    mockRole = 'staff';
    const out = text(mount());
    for (const title of [
      'Status',
      'Who confirms attendance',
      'Clovie voice',
      'Open chat',
    ]) {
      expect(out).toContain(title);
    }
    expect(out).toContain('Only the owner can change this.');
  });
});
