import '@/lib/i18n';

import * as React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsScreen } from '../components/SettingsScreen';
import { settingsGroups } from '../navigation';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Redirect: () => null,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' }, nativeBuildVersion: '24' },
}));

jest.mock('@clerk/expo', () => ({
  useClerk: () => ({ signOut: jest.fn() }),
  useUser: () => ({
    user: {
      fullName: 'Thandi Mokoena',
      primaryEmailAddress: { emailAddress: 'thandi@example.com' },
    },
  }),
  useOrganization: () => ({ organization: { name: 'Ashgrove Hair & Beauty' } }),
}));

type Role = 'owner' | 'staff';
interface MockMe {
  data: { role: Role } | undefined;
  isPending: boolean;
}
const mockMe: MockMe = { data: { role: 'owner' }, isPending: false };
jest.mock('@/features/business/me', () => ({
  useMe: () => mockMe,
  useCanManage: () => mockMe.data?.role !== 'staff',
}));

jest.mock('@/features/business/hooks', () => ({
  useWhatsAppAccount: () => ({ data: { status: 'live' } }),
  useBusinessDetails: () => ({ data: { name: 'Ashgrove Hair & Beauty' } }),
  useBusinessHours: () => ({
    data: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday })),
  }),
}));

jest.mock('@/features/catalog/hooks', () => ({
  useServices: () => ({ data: new Array(14).fill({}) }),
  useStaff: () => ({ data: new Array(4).fill({}) }),
}));

jest.mock('../hooks', () => ({
  useBookingRules: () => ({ data: { lead_time_minutes: 60 } }),
}));

let mockChannel: { data: Record<string, unknown> | undefined } = {
  data: undefined,
};
jest.mock('../useWhatsAppChannel', () => ({
  useWhatsAppChannel: () => mockChannel,
}));

jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
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
        <SettingsScreen />
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

const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0];

const hasSwitch = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) =>
      n.props.accessibilityLabel === label &&
      typeof n.props.onCheckedChange === 'function',
  ).length > 0;

const ALL_ROWS = [
  'Business details',
  'Opening hours',
  'Services',
  'Booking rules',
  'Team',
  'WhatsApp',
  'Notifications',
  'Appearance',
  'Haptic feedback',
  'Delete account',
];
const HEADINGS = ['Your business', 'WhatsApp', 'Account'];

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.data = { role: 'owner' };
  mockChannel = { data: undefined };
});

describe('The WhatsApp row', () => {
  it.each([
    [
      { status: 'live', display_phone: '+27821234567' },
      'Connected · +27 82 123 4567',
    ],
    [{ status: 'paused', display_phone: '+27821234567' }, 'Paused'],
    [{ status: 'pending', display_phone: null }, 'Pending'],
    [{ status: 'needs_reauth', display_phone: null }, 'Needs reconnecting'],
    [{ status: 'disconnected', display_phone: null }, 'Not connected'],
    [{ status: null, display_phone: null }, 'Not connected'],
  ])('shows the WhatsApp row for %j as %s', (channel, detail) => {
    mockChannel = { data: channel };
    expect(text(mount())).toContain(`WhatsApp | ${detail}`);
  });

  it('leaves the WhatsApp row bare until the channel status has loaded', () => {
    expect(text(mount())).not.toMatch(
      /WhatsApp \| (Connected|Paused|Pending|Needs|Not connected)/,
    );
  });
});

describe('Settings as owner', () => {
  it('lists every group and row with its value', () => {
    const out = text(mount());
    expect(out).toContain('Ashgrove Hair & Beauty');
    expect(out).toContain('Owner');
    for (const heading of HEADINGS) expect(out).toContain(heading);
    for (const row of ALL_ROWS) expect(out).toContain(row);
    expect(out).toContain('Opening hours | Mon–Sat');
    expect(out).toContain('Services | 14');
    expect(out).toContain('Booking rules | 1 hour notice');
    expect(out).toContain('Team | 4');
    expect(out).toContain('Sign out');
    expect(out).toContain('Clovie 1.0.0 (24)');
  });

  it('keeps the menu free of explainer thumbnails (they live on the sub-pages)', () => {
    const tree = mount();
    expect(
      tree.root.findAll((n) =>
        String(n.props.testID ?? '').startsWith('explainer-'),
      ),
    ).toHaveLength(0);
  });

  it('opens each row on its own route', () => {
    const tree = mount();
    act(() => pressable(tree, 'Team, 4')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/team');
    act(() => pressable(tree, 'Delete account')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/delete-account');
  });

  it('opens the business details from the profile row', () => {
    const tree = mount();
    act(() =>
      pressable(tree, 'Ashgrove Hair & Beauty, Owner')?.props.onPress(),
    );
    expect(mockPush).toHaveBeenCalledWith('/settings/business-details');
  });

  it('toggles the appearance with a switch', () => {
    expect(hasSwitch(mount(), 'Appearance')).toBe(true);
  });

  it('has a haptic feedback switch', () => {
    expect(hasSwitch(mount(), 'Haptic feedback')).toBe(true);
  });
});

describe('Settings as staff', () => {
  beforeEach(() => {
    mockMe.data = { role: 'staff' };
  });

  it('lists exactly the rows and groups the owner sees', () => {
    const out = text(mount());
    expect(out).toContain('Staff');
    for (const heading of HEADINGS) expect(out).toContain(heading);
    for (const row of ALL_ROWS) expect(out).toContain(row);
  });

  it('opens the owner-only screens (read-only) instead of dropping them', () => {
    const tree = mount();
    act(() => pressable(tree, 'Booking rules, 1 hour notice')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/booking-rules');
    act(() => pressable(tree, 'Team, 4')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/team');
  });

  it('opens the business details from the profile row, read-only there', () => {
    const tree = mount();
    act(() =>
      pressable(tree, 'Ashgrove Hair & Beauty, Staff')?.props.onPress(),
    );
    expect(mockPush).toHaveBeenCalledWith('/settings/business-details');
  });

  it('has the appearance switch too', () => {
    expect(hasSwitch(mount(), 'Appearance')).toBe(true);
  });
});

describe('No row ever disappears', () => {
  const rowsFor = (setup: () => void) => {
    setup();
    const out = text(mount());
    return ALL_ROWS.filter((row) => out.includes(row));
  };

  it.each([
    ['an owner', () => (mockMe.data = { role: 'owner' })],
    ['staff', () => (mockMe.data = { role: 'staff' })],
    ['a role that has not loaded', () => (mockMe.data = undefined)],
  ])('keeps all rows for %s', (_name, setup) => {
    expect(rowsFor(setup)).toEqual(ALL_ROWS);
  });

  it('is one list whatever the role', () => {
    expect(settingsGroups().flatMap((g) => g.items)).toHaveLength(
      ALL_ROWS.length,
    );
  });
});
