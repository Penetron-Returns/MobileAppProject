import '@/lib/i18n';

import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act } from 'react-test-renderer';

import { ConversationScreen } from '../components/ConversationScreen';

const mockHead = jest.fn();
const mockMessages = jest.fn();

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  },
  usePathname: () => '/inbox/c-1',
}));
jest.mock('../hooks', () => ({
  useConversation: () => mockHead(),
  useThreadMessages: () => mockMessages(),
  useSendReply: () => ({ mutate: jest.fn(), isPending: false }),
  useReleaseConversation: () => ({ mutate: jest.fn(), isPending: false }),
}));

const query = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  isSuccess: true,
  error: null,
  fetchStatus: 'idle',
  dataUpdatedAt: 1,
  refetch: jest.fn(),
});

const metrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

function mount() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ConversationScreen conversationId="c-1" />
      </SafeAreaProvider>,
    );
  });
  return tree;
}
const text = (tree: renderer.ReactTestRenderer) =>
  JSON.stringify(tree.toJSON(), (k, v) =>
    k === 'refreshControl' ? undefined : v,
  );

beforeEach(() => {
  mockMessages.mockReturnValue(query([]));
});

describe('ConversationScreen', () => {
  it('shows a not-found state for a deleted or unknown conversation, without the composer', () => {
    mockHead.mockReturnValue(query(null));
    const json = text(mount());
    expect(json).toContain("That conversation isn't here");
    expect(json).toContain('Back to inbox');
    expect(json).not.toContain('Done, back to menu');
  });

  it('shows the thread for a conversation that exists', () => {
    mockHead.mockReturnValue(
      query({
        id: 'c-1',
        state: 'handed_over',
        window_expires_at: null,
        client: {
          id: 'cl-1',
          name: 'Olivia Bennett',
          phone_e164: '+27821234567',
        },
        escalations: [],
      }),
    );
    const json = text(mount());
    expect(json).toContain('Olivia Bennett');
    expect(json).toContain('Done, back to menu');
    expect(json).not.toContain("That conversation isn't here");
  });
});
