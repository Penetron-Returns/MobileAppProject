import '@/lib/i18n';

import type { TeamDTO } from '@booking/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError, api } from '@/lib/api';
import { toast } from '@/lib/toast';

import { TeamScreen } from '../components/TeamScreen';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

// Dialogs portal into a host the test renderer does not have: render the
// open dialog inline with its two buttons.
interface DialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onOpenChange: (isOpen: boolean) => void;
}
function mockConfirmDialog(props: DialogProps) {
  if (!props.open) return null;
  return (
    <View>
      <Text>{props.title}</Text>
      <Text>{props.description}</Text>
      <Pressable
        accessibilityLabel={`dialog:${props.confirmLabel}`}
        onPress={props.onConfirm}
      />
      <Pressable
        accessibilityLabel={`dialog:${props.cancelLabel}`}
        onPress={() => props.onOpenChange(false)}
      />
    </View>
  );
}
jest.mock('@booking/ui/components/ConfirmDialog', () => ({
  ConfirmDialog: (props: never) => mockConfirmDialog(props),
}));

jest.mock('@/lib/toast', () => ({
  toast: {
    failed: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
  describeError: () => ({ message: 'Something went wrong', requestId: null }),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    newIdempotencyKey: () => 'key-1',
    api: {
      team: jest.fn(),
      createInvitation: jest.fn(),
      revokeInvitation: jest.fn(),
      updateMemberRole: jest.fn(),
      removeMember: jest.fn(),
    },
  };
});

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () =>
        Promise.resolve({
          data: [
            {
              staff_id: 's1',
              weekday: 1,
              start_time: '08:00:00',
              end_time: '17:00:00',
            },
            {
              staff_id: 's1',
              weekday: 2,
              start_time: '08:00:00',
              end_time: '17:00:00',
            },
          ],
          error: null,
        }),
    }),
  },
  unwrap: (res: { data: unknown }) => res.data,
}));

jest.mock('@/features/business/me', () => ({
  useCanManage: () => true,
  useMe: () => ({ data: { role: 'owner' }, isPending: false }),
}));

const mockStaff = [
  ['s1', 'Thandi Mokoena', 'Senior stylist', 'thandi@x.co', '#007AFF'],
  ['s2', 'Ruan van Wyk', 'Barber', null, '#FF9500'],
  ['s3', 'Aisha Patel', 'Nail technician', 'aisha@x.co', null],
  ['s4', 'Lerato Dlamini', 'Beauty therapist', 'lerato@x.co', null],
].map(([id, name, title, email, color]) => ({
  id,
  user_id: null,
  name,
  title,
  photo_url: null,
  phone: null,
  email,
  color,
  is_active: true,
  accepts_bookings: true,
  sort_order: 0,
}));

const mockQuery = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  isSuccess: true,
  error: null,
  fetchStatus: 'idle' as const,
  dataUpdatedAt: 1,
  refetch: jest.fn(),
});

jest.mock('@/features/catalog/hooks', () => ({
  useStaff: () => mockQuery(mockStaff),
  useServices: () => mockQuery([]),
  useStaffServices: () =>
    mockQuery([
      { staff_id: 's1', service_id: 'sv1' },
      { staff_id: 's1', service_id: 'sv2' },
    ]),
  useSaveStaff: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteStaff: () => ({ mutate: jest.fn(), isPending: false }),
}));

const TEAM: TeamDTO = {
  members: [
    {
      user_id: 'u1',
      name: 'Thandi Mokoena',
      email: 'thandi@x.co',
      role: 'owner',
      staff_id: 's1',
      is_self: true,
    },
    {
      user_id: 'u2',
      name: 'Ruan van Wyk',
      email: 'ruan@x.co',
      role: 'staff',
      staff_id: 's2',
      is_self: false,
    },
  ],
  invitations: [
    {
      id: 'inv-3',
      email: 'aisha@x.co',
      role: 'staff',
      staff_id: 's3',
      created_at: '2026-10-01T08:00:00Z',
    },
    {
      id: 'inv-9',
      email: 'new@x.co',
      role: 'staff',
      staff_id: null,
      created_at: '2026-10-02T08:00:00Z',
    },
  ],
};

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

async function mount(): Promise<ReactTestRenderer> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={METRICS}>
          <TeamScreen />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  });
  // Let the team and availability queries settle (react-query notifies on a timer).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

/** Every string rendered under the tree, joined (host props are not included). */
function json(tree: ReactTestRenderer): string {
  const parts: string[] = [];
  const visit = (node: ReactTestInstance | string) => {
    if (typeof node === 'string') parts.push(node);
    else node.children.forEach(visit);
  };
  visit(tree.root);
  return parts.map((p) => `"${p}"`).join(' ');
}

function byLabel(
  tree: ReactTestRenderer,
  label: string,
  prop = 'onPress',
): ReactTestInstance {
  const match = tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props[prop],
  )[0];
  if (!match) throw new Error(`no ${prop} element labelled "${label}"`);
  return match;
}

async function press(tree: ReactTestRenderer, label: string) {
  await act(async () => {
    byLabel(tree, label).props.onPress();
  });
}

async function type(tree: ReactTestRenderer, label: string, text: string) {
  await act(async () => {
    byLabel(tree, label, 'onChangeText').props.onChangeText(text);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.team).mockResolvedValue(TEAM);
  jest.mocked(api.createInvitation).mockResolvedValue({
    id: 'inv-new',
    email: 'x',
    role: 'staff',
    staff_id: null,
    created_at: '2026-10-03T08:00:00Z',
  });
  jest.mocked(api.revokeInvitation).mockResolvedValue({
    id: 'inv-3',
    revoked: true,
  });
  jest.mocked(api.removeMember).mockResolvedValue({
    user_id: 'u2',
    removed: true,
  });
  jest.mocked(api.updateMemberRole).mockResolvedValue({
    ...TEAM.members[1],
    role: 'owner',
  });
});

describe('Team list', () => {
  it('shows each person as a member, invited or with no app access', async () => {
    const tree = await mount();
    const out = json(tree);
    expect(out).toContain('4 people can take bookings');
    // The owner has a login; a staff member's login needs no note.
    expect(out).toContain('Senior stylist · Owner');
    expect(out).toContain('Barber · Staff');
    expect(out).toContain('Nail technician · Invite pending');
    expect(out).toContain('Beauty therapist · No app access');
    // An email invite with no calendar row yet gets its own row.
    expect(out).toContain('new@x.co');
  });

  it('speaks the access state in the row label', async () => {
    const tree = await mount();
    expect(
      byLabel(tree, 'Thandi Mokoena, Senior stylist, can sign in. Open'),
    ).toBeTruthy();
    expect(
      byLabel(tree, 'Aisha Patel, Nail technician, invite pending. Open'),
    ).toBeTruthy();
    expect(
      byLabel(tree, 'Lerato Dlamini, Beauty therapist, no app access. Open'),
    ).toBeTruthy();
  });
});

describe('Invite from the list', () => {
  it('opens the email card with the board copy', async () => {
    const tree = await mount();
    expect(json(tree)).not.toContain('Their email address');
    await press(tree, 'Invite a team member');
    const out = json(tree);
    expect(out).toContain('Their email address');
    expect(out).toContain(
      'They get an email invite. They join by signing in to the app with this address.',
    );
    const input = byLabel(tree, 'Their email address', 'onChangeText');
    expect(input.props.keyboardType).toBe('email-address');
    expect(input.props.autoComplete).toBe('email');
  });

  it('refuses an empty or malformed address and sends nothing', async () => {
    const tree = await mount();
    await press(tree, 'Invite a team member');
    await press(tree, 'Send invite');
    expect(json(tree)).toContain('This field is required.');
    await type(tree, 'Their email address', 'not-an-email');
    await press(tree, 'Send invite');
    expect(json(tree)).toContain('Enter a valid email address.');
    expect(api.createInvitation).not.toHaveBeenCalled();
  });

  it('sends an email-only staff invite with an idempotency key, then confirms', async () => {
    const tree = await mount();
    await press(tree, 'Invite a team member');
    await type(tree, 'Their email address', 'sam@example.com');
    await press(tree, 'Send invite');
    expect(api.createInvitation).toHaveBeenCalledTimes(1);
    const [body, key] = jest.mocked(api.createInvitation).mock.calls[0];
    expect(body).toEqual({ email: 'sam@example.com', role: 'staff' });
    expect(typeof key).toBe('string');
    expect(json(tree)).toContain('Invite sent.');
    expect(json(tree)).not.toContain('Their email address');
  });

  it('shows the rule message when the address is already invited', async () => {
    jest.mocked(api.createInvitation).mockRejectedValue(
      new ApiError({
        code: 'RULE_VIOLATION',
        message: 'nope',
        status: 422,
        requestId: 'req-1',
        details: { rule: 'ALREADY_INVITED' },
      }),
    );
    const tree = await mount();
    await press(tree, 'Invite a team member');
    await type(tree, 'Their email address', 'aisha@x.co');
    await press(tree, 'Send invite');
    expect(toast.failed).toHaveBeenCalledWith(
      'That address already has a pending invite.',
      expect.any(ApiError),
    );
  });
});

describe('Person page', () => {
  it('shows the name, job, working days and services count', async () => {
    const tree = await mount();
    await press(tree, 'Thandi Mokoena, Senior stylist, can sign in. Open');
    const out = json(tree);
    expect(out).toContain('Thandi Mokoena');
    expect(out).toContain('Senior stylist');
    expect(out).toContain('Working days');
    expect(out).toContain('Mon, Tue, 08:00 to 17:00');
    expect(out).toContain('2 services');
    // The nav title is the first name and back returns to Team.
    expect(byLabel(tree, 'Team')).toBeTruthy();
  });

  it('invites someone with no app access, linked to their calendar row', async () => {
    const tree = await mount();
    await press(tree, 'Lerato Dlamini, Beauty therapist, no app access. Open');
    await press(tree, 'Invite to the app');
    await type(tree, 'Their email address', 'lerato@example.com');
    await press(tree, 'Send invite');
    expect(api.createInvitation).toHaveBeenCalledWith(
      { email: 'lerato@example.com', role: 'staff', staff_id: 's4' },
      expect.any(String),
    );
  });

  it('prefills the invite with the email already on the staff row', async () => {
    const tree = await mount();
    await press(tree, 'Lerato Dlamini, Beauty therapist, no app access. Open');
    await press(tree, 'Invite to the app');
    expect(
      byLabel(tree, 'Their email address', 'onChangeText').props.value,
    ).toBe('lerato@x.co');
  });

  it('does not offer an invite to someone who already has a login, and goes back to the list', async () => {
    const tree = await mount();
    await press(tree, 'Ruan van Wyk, Barber, can sign in. Open');
    expect(json(tree)).not.toContain('Invite to the app');
    await press(tree, 'Team');
    expect(json(tree)).toContain('4 people can take bookings');
  });
});

describe('Role change', () => {
  async function openRuan(tree: ReactTestRenderer) {
    await press(tree, 'Ruan van Wyk, Barber, can sign in. Open');
  }

  it('changes a login to owner through the API', async () => {
    const tree = await mount();
    await openRuan(tree);
    await press(tree, 'Owner');
    expect(api.updateMemberRole).toHaveBeenCalledWith(
      'u2',
      { role: 'owner' },
      expect.any(String),
    );
  });

  it('does nothing when the current role is picked again', async () => {
    const tree = await mount();
    await openRuan(tree);
    await press(tree, 'Staff');
    expect(api.updateMemberRole).not.toHaveBeenCalled();
  });

  it('explains the last-owner rule instead of a generic error', async () => {
    jest.mocked(api.updateMemberRole).mockRejectedValue(
      new ApiError({
        code: 'RULE_VIOLATION',
        message: 'last owner',
        status: 422,
        details: { rule: 'LAST_OWNER' },
      }),
    );
    const tree = await mount();
    await openRuan(tree);
    await press(tree, 'Owner');
    expect(toast.failed).toHaveBeenCalledWith(
      'A business needs at least one owner. Make someone else an owner first.',
      expect.any(ApiError),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says only the owner can manage the team on FORBIDDEN', async () => {
    jest
      .mocked(api.updateMemberRole)
      .mockRejectedValue(
        new ApiError({ code: 'FORBIDDEN', message: 'no', status: 403 }),
      );
    const tree = await mount();
    await openRuan(tree);
    await press(tree, 'Owner');
    expect(toast.failed).toHaveBeenCalledWith(
      'Only the owner can manage the team.',
      expect.any(ApiError),
    );
  });
});

describe('Remove from team', () => {
  async function openRuanMore(tree: ReactTestRenderer) {
    await press(tree, 'Ruan van Wyk, Barber, can sign in. Open');
  }

  it('asks first and explains the calendar keeps them', async () => {
    const tree = await mount();
    await openRuanMore(tree);
    await press(tree, 'Remove from team');
    const out = json(tree);
    expect(out).toContain('Remove Ruan van Wyk from the team?');
    expect(out).toContain('removes their access to the app');
    expect(out).toContain('stays in the calendar');
    expect(api.removeMember).not.toHaveBeenCalled();
  });

  it('removes the login only after confirming, then returns to the list', async () => {
    const tree = await mount();
    await openRuanMore(tree);
    await press(tree, 'Remove from team');
    await press(tree, 'dialog:Remove');
    expect(api.removeMember).toHaveBeenCalledWith('u2', expect.any(String));
    expect(toast.success).toHaveBeenCalledWith(
      'Ruan van Wyk no longer has app access',
    );
    expect(json(tree)).toContain('4 people can take bookings');
  });

  it('keeps them when the dialog is dismissed', async () => {
    const tree = await mount();
    await openRuanMore(tree);
    await press(tree, 'Remove from team');
    await press(tree, 'dialog:Keep');
    expect(api.removeMember).not.toHaveBeenCalled();
  });

  it('shows Remove from team for yourself, dimmed and with the reason', async () => {
    const tree = await mount();
    await press(tree, 'Thandi Mokoena, Senior stylist, can sign in. Open');
    expect(json(tree)).toContain('You cannot remove yourself from the team.');
    const row = tree.root.findAll(
      (n) =>
        n.props.accessibilityLabel === 'Remove from team' &&
        n.props.accessibilityState?.disabled === true,
    );
    expect(row.length).toBeGreaterThan(0);
  });

  it('lists role, calendar colour and Remove from team on the person page, without a More disclosure', async () => {
    const tree = await mount();
    await press(tree, 'Ruan van Wyk, Barber, can sign in. Open');
    const out = json(tree);
    expect(out).toContain('Role');
    expect(out).toContain('Calendar color');
    expect(out).toContain('Remove from team');
    expect(out).not.toContain('"More"');
  });
});

describe('Pending invite', () => {
  it('can be revoked from the person page', async () => {
    const tree = await mount();
    await press(tree, 'Aisha Patel, Nail technician, invite pending. Open');
    expect(json(tree)).toContain('Invite sent to aisha@x.co as Staff.');
    await press(tree, 'Revoke invite');
    expect(api.revokeInvitation).toHaveBeenCalledWith(
      'inv-3',
      expect.any(String),
    );
    expect(toast.success).toHaveBeenCalledWith('Invite revoked');
  });
});
