import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { qk } from '@/lib/query';
import { toast } from '@/lib/toast';

import { usePendingInvitations, type PendingInvitation } from '../hooks';
import { JoinScreen } from '../components/JoinScreen';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

// The confirm dialog portals into a host the test renderer lacks: render its
// props as a plain element so a test can read `open` and call `onConfirm`.
jest.mock('@booking/ui/components/ConfirmDialog', () => {
  const { View } = require('react-native');
  return {
    ConfirmDialog: (props: Record<string, unknown>) => (
      <View testID="confirm-dialog" {...props} />
    ),
  };
});

const mockSignOut = jest.fn();
jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => mockSignOut,
}));

const mockSetActive = jest.fn();
const mockGetInvitations = jest.fn();
const mockUpdateUser = jest.fn();
let mockFirstName: string | null = 'Sam';
jest.mock('@clerk/expo', () => ({
  useClerk: () => ({ setActive: mockSetActive }),
  useUser: () => ({
    user: {
      id: 'user_1',
      firstName: mockFirstName,
      update: mockUpdateUser,
      getOrganizationInvitations: mockGetInvitations,
    },
  }),
}));

jest.mock('@/lib/toast', () => ({
  toast: {
    failed: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

const invitation = (
  id: string,
  name: string,
  accept = jest.fn().mockResolvedValue(undefined),
): PendingInvitation => ({
  id,
  organizationId: `org_${id}`,
  organizationName: name,
  imageUrl: null,
  accept,
});

function mountWith(element: React.ReactElement, client = newClient()) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  return { tree, client };
}

const newClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });

function text(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const visit = (node: ReactTestInstance | string) => {
    if (typeof node === 'string') parts.push(node);
    else node.children.forEach(visit);
  };
  visit(tree.root);
  return parts.join(' | ');
}

function button(tree: ReactTestRenderer, label: string) {
  const match = tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0];
  if (!match) throw new Error(`no button "${label}"`);
  return match;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetActive.mockResolvedValue(undefined);
  mockUpdateUser.mockResolvedValue(undefined);
  mockFirstName = 'Sam';
});

describe('JoinScreen', () => {
  it('says which business invited you and offers Join and Create my own', () => {
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair')]}
        onDecline={jest.fn()}
      />,
    );
    const out = text(tree);
    expect(out).toContain("You've been invited to Ashgrove Hair");
    // The primary label is short so it fits the 56pt button; the business is named above.
    expect(out).toContain('Join');
    expect(out).not.toContain('Join Ashgrove Hair');
    expect(out).toContain('Create my own business instead');
  });

  it('accepts the invitation, then makes the organisation active and refetches /v1/me', async () => {
    const accept = jest.fn().mockResolvedValue(undefined);
    const client = newClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={jest.fn()}
      />,
      client,
    );
    await act(async () => {
      button(tree, 'Join Ashgrove Hair').props.onPress();
    });
    expect(accept).toHaveBeenCalledTimes(1);
    expect(mockSetActive).toHaveBeenCalledWith({
      organization: 'org_1',
      navigate: expect.any(Function),
    });
    // Accepting happens before activating: the org must be ours first.
    expect(accept.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetActive.mock.invocationCallOrder[0],
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.me });
  });

  it('asks before creating your own business, and goes back without declining', () => {
    const onDecline = jest.fn();
    const accept = jest.fn();
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={onDecline}
      />,
    );
    const dialog = () =>
      tree.root.find((n) => n.props.testID === 'confirm-dialog');
    expect(dialog().props.open).toBe(false);
    act(() => button(tree, 'Create my own business instead').props.onPress());
    expect(onDecline).not.toHaveBeenCalled();
    expect(dialog().props.open).toBe(true);
    act(() => dialog().props.onOpenChange(false));
    expect(dialog().props.open).toBe(false);
    expect(onDecline).not.toHaveBeenCalled();
  });

  it('declines to the create-business flow only after confirming, without accepting anything', () => {
    const onDecline = jest.fn();
    const accept = jest.fn();
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={onDecline}
      />,
    );
    act(() => button(tree, 'Create my own business instead').props.onPress());
    const dialog = tree.root.find((n) => n.props.testID === 'confirm-dialog');
    act(() => dialog.props.onConfirm());
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(accept).not.toHaveBeenCalled();
  });

  it('shows Create my own as a small text link, not a full-size button', () => {
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair')]}
        onDecline={jest.fn()}
      />,
    );
    const link = button(tree, 'Create my own business instead');
    expect(String(link.props.className)).toContain('min-h-11');
    expect(String(link.props.className)).not.toContain('h-14');
  });

  it('offers a way out for the wrong email: sign out', () => {
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair')]}
        onDecline={jest.fn()}
      />,
    );
    expect(text(tree)).toContain(
      'Wrong email? Sign out and use the address the invite went to.',
    );
    act(() =>
      button(
        tree,
        'Wrong email? Sign out and use the address the invite went to.',
      ).props.onPress(),
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('tells the person when joining fails and stays on the screen', async () => {
    const accept = jest.fn().mockRejectedValue(new Error('expired'));
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={jest.fn()}
      />,
    );
    await act(async () => {
      button(tree, 'Join Ashgrove Hair').props.onPress();
    });
    expect(toast.failed).toHaveBeenCalledWith(
      "Couldn't join. Check your connection and try again.",
    );
    expect(mockSetActive).not.toHaveBeenCalled();
    expect(button(tree, 'Join Ashgrove Hair')).toBeTruthy();
  });

  it('lists further invitations as their own Join buttons', async () => {
    const second = jest.fn().mockResolvedValue(undefined);
    const { tree } = mountWith(
      <JoinScreen
        invitations={[
          invitation('1', 'Ashgrove Hair'),
          invitation('2', 'Barber Bros', second),
        ]}
        onDecline={jest.fn()}
      />,
    );
    await act(async () => {
      button(tree, 'Join Barber Bros').props.onPress();
    });
    expect(second).toHaveBeenCalledTimes(1);
    expect(mockSetActive).toHaveBeenCalledWith(
      expect.objectContaining({ organization: 'org_2' }),
    );
  });

  it('renders nothing without an invitation', () => {
    const { tree } = mountWith(
      <JoinScreen invitations={[]} onDecline={jest.fn()} />,
    );
    expect(text(tree)).toBe('');
  });
});

describe('JoinScreen name step', () => {
  const nameInput = (tree: ReactTestRenderer, label: string) =>
    tree.root.find(
      (n) => n.props.accessibilityLabel === label && !!n.props.onChangeText,
    );

  it('does not ask for a name when Clerk already has one', () => {
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair')]}
        onDecline={jest.fn()}
      />,
    );
    expect(text(tree)).not.toContain('Your name');
  });

  it('asks a nameless person for a name and blocks Join until the first name is filled in', async () => {
    mockFirstName = null;
    const accept = jest.fn().mockResolvedValue(undefined);
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={jest.fn()}
      />,
    );
    expect(text(tree)).toContain('Your name');
    act(() => nameInput(tree, 'First name').props.onChangeText('   '));
    await act(async () => {
      button(tree, 'Join Ashgrove Hair').props.onPress();
    });
    expect(text(tree)).toContain('Enter your first name.');
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  it('saves the trimmed name to Clerk before accepting the invitation', async () => {
    mockFirstName = null;
    const accept = jest.fn().mockResolvedValue(undefined);
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={jest.fn()}
      />,
    );
    act(() => nameInput(tree, 'First name').props.onChangeText('  Sam '));
    act(() => nameInput(tree, 'Last name').props.onChangeText(' Jones  '));
    await act(async () => {
      button(tree, 'Join Ashgrove Hair').props.onPress();
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({
      firstName: 'Sam',
      lastName: 'Jones',
    });
    expect(mockUpdateUser.mock.invocationCallOrder[0]).toBeLessThan(
      accept.mock.invocationCallOrder[0],
    );
  });

  it('does not accept when saving the name fails', async () => {
    mockFirstName = null;
    mockUpdateUser.mockRejectedValue(new Error('nope'));
    const accept = jest.fn().mockResolvedValue(undefined);
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={jest.fn()}
      />,
    );
    act(() => nameInput(tree, 'First name').props.onChangeText('Sam'));
    await act(async () => {
      button(tree, 'Join Ashgrove Hair').props.onPress();
    });
    expect(accept).not.toHaveBeenCalled();
    expect(toast.failed).toHaveBeenCalled();
  });
});

describe('usePendingInvitations', () => {
  function probe(enabled: boolean) {
    const ref: {
      current: ReturnType<typeof usePendingInvitations> | null;
    } = { current: null };
    function Probe() {
      ref.current = usePendingInvitations(enabled);
      return null;
    }
    mountWith(<Probe />);
    return ref;
  }

  it('maps Clerk pending invitations to what the screen shows', async () => {
    mockGetInvitations.mockResolvedValue({
      data: [
        {
          id: 'inv_1',
          publicOrganizationData: {
            id: 'org_9',
            name: 'Ashgrove Hair',
            hasImage: true,
            imageUrl: 'https://img/logo.png',
          },
          accept: jest.fn(),
        },
        {
          id: 'inv_2',
          publicOrganizationData: {
            id: 'org_8',
            name: 'Barber Bros',
            hasImage: false,
            imageUrl: 'https://img/default.png',
          },
          accept: jest.fn(),
        },
      ],
    });
    const ref = probe(true);
    for (let i = 0; i < 20 && !ref.current?.data; i += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
    expect(mockGetInvitations).toHaveBeenCalledWith({ status: 'pending' });
    expect(
      ref.current?.data?.map((i) => [
        i.id,
        i.organizationId,
        i.organizationName,
        i.imageUrl,
      ]),
    ).toEqual([
      ['inv_1', 'org_9', 'Ashgrove Hair', 'https://img/logo.png'],
      ['inv_2', 'org_8', 'Barber Bros', null],
    ]);
  });

  it('does not ask Clerk while disabled', async () => {
    probe(false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockGetInvitations).not.toHaveBeenCalled();
  });
});
