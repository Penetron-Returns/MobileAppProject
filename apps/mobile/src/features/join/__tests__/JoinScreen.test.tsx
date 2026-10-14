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

const mockSetActive = jest.fn();
const mockGetInvitations = jest.fn();
jest.mock('@clerk/expo', () => ({
  useClerk: () => ({ setActive: mockSetActive }),
  useUser: () => ({
    user: {
      id: 'user_1',
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
    expect(out).toContain('Join Ashgrove Hair');
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

  it('declines to the create-business flow without accepting anything', () => {
    const onDecline = jest.fn();
    const accept = jest.fn();
    const { tree } = mountWith(
      <JoinScreen
        invitations={[invitation('1', 'Ashgrove Hair', accept)]}
        onDecline={onDecline}
      />,
    );
    act(() => button(tree, 'Create my own business instead').props.onPress());
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(accept).not.toHaveBeenCalled();
    expect(mockSetActive).not.toHaveBeenCalled();
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
    expect(text(tree)).toContain('Join Ashgrove Hair');
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
