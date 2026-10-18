import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { FlatList } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import renderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

const mockBook = jest.fn();
jest.mock('../hooks', () => ({ useClientBook: () => mockBook() }));
jest.mock('@/features/business/hooks', () => ({
  useBusiness: () => ({
    data: { timezone: 'Africa/Johannesburg' },
    isError: false,
    isPending: false,
  }),
}));
jest.mock('@/features/inbox/hooks', () => ({
  useInboxThreads: () => ({
    data: [
      { last_message_at: '2026-10-14T09:00:00.000Z', client: { id: 'c-3' } },
    ],
  }),
}));

import { ClientsScreen } from '../components/ClientsScreen';

const NOW_MS = Date.parse('2026-10-14T10:00:00.000Z');

const CLIENTS = [
  {
    id: 'c-1',
    name: 'Amina Khan',
    phone_e164: '+27821110001',
    tags: [],
    appointments: [
      {
        starts_at: '2026-10-09T08:00:00.000Z',
        created_at: '2026-10-01T08:00:00.000Z',
        status: 'completed',
        service: { name: 'Gel Manicure' },
      },
    ],
  },
  {
    id: 'c-2',
    name: 'Johan Pretorius',
    phone_e164: '+27821110002',
    tags: ['VIP'],
    appointments: [
      {
        starts_at: '2026-10-14T07:00:00.000Z',
        created_at: '2026-10-02T08:00:00.000Z',
        status: 'completed',
        service: { name: 'Fade & beard trim' },
      },
    ],
  },
  {
    id: 'c-3',
    name: 'Émile Roux',
    phone_e164: '+27821110003',
    tags: [],
    appointments: [],
  },
];

const initialMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

function renderScreen() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ClientsScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  // VirtualizedList batches its first render on a timer.
  act(() => {
    jest.runOnlyPendingTimers();
  });
  return tree;
}

const labelled = (tree: renderer.ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && typeof n.type !== 'string',
  );

const hasText = (tree: renderer.ReactTestRenderer, text: string) =>
  tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      (n.props.children === text ||
        (Array.isArray(n.props.children) &&
          n.props.children.join('') === text)),
  ).length > 0;

beforeEach(() => {
  jest.useFakeTimers();
  mockPush.mockClear();
  mockBook.mockReturnValue({
    data: CLIENTS,
    dataUpdatedAt: NOW_MS,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: jest.fn(),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Clients phone book', () => {
  it('renders A-Z sections, rows with a spoken label, and the Recent card', () => {
    const tree = renderScreen();
    expect(hasText(tree, 'Clients')).toBe(true);
    expect(hasText(tree, 'Recent')).toBe(true);
    // Sections sorted with accents folded: Amina (A), Émile (E), Johan (J).
    const headers = tree.root
      .findAll((n) => n.props.accessibilityRole === 'header')
      .map((n) => n.props.children)
      .filter((c) => typeof c === 'string');
    expect(headers).toEqual(expect.arrayContaining(['Recent']));
    for (const letter of ['A', 'E', 'J'])
      expect(hasText(tree, letter)).toBe(true);
    expect(
      labelled(tree, 'Amina Khan, last visit Gel Manicure · 9 Oct').length,
    ).toBeGreaterThan(0);
    expect(
      labelled(
        tree,
        'Johan Pretorius, last visit Fade & beard trim · today, VIP',
      ).length,
    ).toBeGreaterThan(0);
    expect(labelled(tree, 'Émile Roux, no visits yet').length).toBeGreaterThan(
      0,
    );
    expect(hasText(tree, 'VIP')).toBe(true);
  });

  it('puts the most recently active people first in Recent, as buttons with full names', () => {
    const tree = renderScreen();
    const recent = tree.root.findAll(
      (n) => n.props.accessibilityLabel === 'Recent clients',
    );
    expect(recent.length).toBeGreaterThan(0);
    const buttons = recent[0].findAll(
      (n) =>
        n.props.accessibilityRole === 'button' && typeof n.type !== 'string',
    );
    // Émile chatted at 09:00 today, Johan was booked today, Amina on 9 Oct.
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(
      expect.arrayContaining(['Émile Roux', 'Johan Pretorius', 'Amina Khan']),
    );
    expect(buttons[0].props.accessibilityLabel).toBe('Émile Roux');
  });

  it('labels every index letter and opens a client on tap', () => {
    const tree = renderScreen();
    expect(labelled(tree, 'Jump to A').length).toBeGreaterThan(0);
    expect(labelled(tree, 'Jump to Z').length).toBeGreaterThan(0);
    const row = labelled(
      tree,
      'Amina Khan, last visit Gel Manicure · 9 Oct',
    )[0];
    act(() => row.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/clients/c-1');
  });

  it('scrolls to the section when a letter is tapped', () => {
    const scrollTo = jest
      .spyOn(FlatList.prototype, 'scrollToIndex')
      .mockImplementation(() => {});
    const tree = renderScreen();
    act(() => labelled(tree, 'Jump to J')[0].props.onPress());
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ index: 4 }),
    );
    scrollTo.mockRestore();
  });

  it('hides Recent and the index while searching, and Cancel brings them back', () => {
    const tree = renderScreen();
    const input = tree.root.findByProps({
      accessibilityLabel: 'Search clients',
    });
    act(() => input.props.onChangeText('amin'));
    expect(hasText(tree, 'Recent')).toBe(false);
    expect(labelled(tree, 'Jump to A')).toHaveLength(0);
    expect(hasText(tree, 'Amina Khan')).toBe(true);
    expect(hasText(tree, 'Johan Pretorius')).toBe(false);

    const cancel = labelled(tree, 'Cancel')[0];
    act(() => cancel.props.onPress());
    expect(hasText(tree, 'Recent')).toBe(true);
    expect(labelled(tree, 'Jump to A').length).toBeGreaterThan(0);
  });

  it('says so when no client matches the search', () => {
    const tree = renderScreen();
    const input = tree.root.findByProps({
      accessibilityLabel: 'Search clients',
    });
    act(() => input.props.onChangeText('zzz'));
    expect(hasText(tree, 'No clients match “zzz”.')).toBe(true);
  });

  it('shows the first-run empty state when there are no clients', () => {
    mockBook.mockReturnValue({
      data: [],
      dataUpdatedAt: NOW_MS,
      isPending: false,
      isError: false,
      isSuccess: true,
      refetch: jest.fn(),
    });
    const tree = renderScreen();
    expect(hasText(tree, 'No clients yet')).toBe(true);
  });
});
