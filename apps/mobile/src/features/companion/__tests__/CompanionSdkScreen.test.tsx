import { createMockTransport } from '@nerova/react-native/testing';
import * as React from 'react';
import { TextInput } from 'react-native';

import { act, flush, mount, text } from '@/testing/render';

import { CompanionSdkScreen } from '../sdk/CompanionSdkScreen';

const mockCreate = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  newIdempotencyKey: () => 'key-' + Math.random(),
  api: { createCompanionSession: (...args: unknown[]) => mockCreate(...args) },
}));

let mockParams: { heard?: string } = {};
jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

// The real Clovie is a WebView; here it only reports the state it was given.
const mockClovieStates: string[] = [];
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: ({ state }: { state?: string }) => {
    mockClovieStates.push(state ?? 'default');
    return null;
  },
}));

function mountSdk() {
  const transport = createMockTransport({
    setupCompleted: true,
    whatsAppConnected: true,
  });
  const tree = mount(<CompanionSdkScreen transport={transport} />);
  return { tree, transport };
}

function composer(tree: ReturnType<typeof mount>) {
  return tree.root.findByType(TextInput);
}

async function settle() {
  for (let i = 0; i < 5; i++) await flush();
}

beforeEach(() => {
  mockParams = {};
  mockClovieStates.length = 0;
  mockCreate.mockResolvedValue({
    url: 'https://app.nerova.si/widget/owner-chat/abc#state=s',
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  });
});

describe('CompanionSdkScreen', () => {
  it('renders the SDK sheet with exactly one Clovie', async () => {
    const { tree } = mountSdk();
    await settle();
    expect(composer(tree)).toBeTruthy();
    expect(
      tree.root.findAll(
        (n) =>
          typeof n.type === 'string' && n.props.testID === 'companion-clovie',
      ),
    ).toHaveLength(1);
  });

  it('shows a streamed reply and drives Clovie busy then replied', async () => {
    const { tree } = mountSdk();
    await settle();
    await act(async () => {
      composer(tree).props.onChangeText('How many bookings today?');
    });
    const send = tree.root.find((n) => n.props.testID === 'send-button');
    await act(async () => {
      send.props.onPress();
    });
    await settle();

    expect(text(tree)).toContain('6 bookings today');
    expect(mockClovieStates).toContain('working');
    expect(mockClovieStates[mockClovieStates.length - 1]).toBe('default');
    // The SDK's avatar button owns the label, so our Clovie stays decorative.
    expect(
      tree.root.findAll((n) => n.props.testID === 'companion-clovie')[0].props
        .accessibilityElementsHidden,
    ).toBe(true);
  });

  it('fills the composer from a voice request without sending', async () => {
    mockParams = { heard: 'move Megan to Thursday' };
    const { tree, transport } = mountSdk();
    await settle();

    expect(composer(tree).props.value).toBe('move Megan to Thursday');
    expect(
      transport.controls.calls.filter((c) => c.name === 'chat'),
    ).toHaveLength(0);
  });
});
