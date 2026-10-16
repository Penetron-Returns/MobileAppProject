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
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Redirect: () => null,
}));

const mockOpenChat = jest.fn();
jest.mock('@/features/companion/sdk/useOpenCompanion', () => ({
  useOpenCompanion: () => mockOpenChat,
}));

const mockStart = jest.fn();
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
  useConnectWhatsApp: () => ({ start: mockStart, isStarting: false }),
}));

jest.mock('@/features/voice/clovieVoice', () => ({ isSupported: () => true }));

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

beforeEach(() => jest.clearAllMocks());

describe('Companion settings screen', () => {
  it('shows the companion, its status and the WhatsApp connection', () => {
    const out = text(mount());
    expect(out).toContain('Clovie');
    expect(out).toContain('Live');
    expect(out).toContain('Connected');
  });

  it('links to voice and attendance settings and opens the chat from its own row', () => {
    const tree = mount();
    act(() => row(tree, 'Clovie voice')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/voice');
    act(() => row(tree, 'Who confirms attendance')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/attendance');
    expect(mockOpenChat).not.toHaveBeenCalled();
    act(() => row(tree, 'Open chat')?.props.onPress());
    expect(mockOpenChat).toHaveBeenCalledTimes(1);
  });
});
