import '@/lib/i18n';

import * as React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { matchesBusinessName } from '../hooks';
import { DeleteAccountScreen } from '../components/DeleteAccountScreen';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('@clerk/expo', () => ({ useClerk: () => ({ signOut: jest.fn() }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));

const mockMutate = jest.fn();
const mockPreview: { data: unknown } = { data: undefined };
jest.mock('../hooks', () => ({
  ...jest.requireActual('../hooks'),
  useAccountDeletionPreview: () => ({
    data: mockPreview.data,
    isError: false,
    refetch: jest.fn(),
  }),
  useDeleteAccount: () => ({ mutate: mockMutate, isPending: false }),
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <DeleteAccountScreen />
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
  return parts.join(' ');
}

const deleteButton = (tree: ReactTestRenderer) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === 'Delete account' && !!n.props.onPress,
  )[0];

beforeEach(() => mockMutate.mockClear());

describe('matchesBusinessName', () => {
  it.each([
    ['Ashgrove Hair', 'Ashgrove Hair', true],
    ['  ashgrove hair ', 'Ashgrove Hair', true],
    ['Ashgrove', 'Ashgrove Hair', false],
    ['', '', false],
  ])('%j against %j is %s', (typed, name, expected) => {
    expect(matchesBusinessName(typed, name)).toBe(expected);
  });
});

describe('DeleteAccountScreen', () => {
  it('explains that the business goes too and keeps delete disabled until the name is typed', () => {
    mockPreview.data = {
      business_deleted: true,
      business_name: 'Ashgrove Hair',
      other_member_count: 2,
    };
    const tree = mount();
    expect(text(tree)).toContain('only owner of Ashgrove Hair');
    expect(deleteButton(tree)?.props.disabled).toBe(true);
  });

  it('lets a staff member delete without typing anything', () => {
    mockPreview.data = {
      business_deleted: false,
      business_name: 'Ashgrove Hair',
      other_member_count: 1,
    };
    const tree = mount();
    expect(text(tree)).toContain('Your login is deleted');
    expect(deleteButton(tree)?.props.disabled).toBeFalsy();
  });
});
