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

jest.mock('@/features/setup-checklist/components/GetSetUpRow', () => ({
  GetSetUpRow: () => null,
}));
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
  data:
    { role: Role; plan?: string; features?: { feature: string }[] } | undefined;
  isPending: boolean;
}
const mockMe: MockMe = {
  data: { role: 'owner', plan: 'free', features: [] },
  isPending: false,
};
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

const mockSetup = {
  data: {
    companion_live: true,
    whatsapp: {
      connected: false,
      state: 'not_connected',
      display_phone_number: null,
    },
  },
};
const mockSetupEnabled = jest.fn();
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: (opts: { enabled: boolean }) => {
    mockSetupEnabled(opts.enabled);
    return mockSetup;
  },
}));

let mockChannel: { data: Record<string, unknown> | undefined } = {
  data: undefined,
};
const mockChannelEnabled = jest.fn();
jest.mock('../useWhatsAppChannel', () => ({
  useWhatsAppChannel: (opts: { enabled: boolean }) => {
    mockChannelEnabled(opts.enabled);
    return mockChannel;
  },
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
  'Clovie',
  'WhatsApp',
  'Plan',
  'Notifications',
  'Appearance',
  'Haptic feedback',
  'Delete account',
];
const HEADINGS = ['Your business', 'Clovie and WhatsApp', 'Account'];

const asOwner = (plan: string, features: string[] = []) => {
  mockMe.data = {
    role: 'owner',
    plan,
    features: features.map((feature) => ({ feature })),
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  asOwner('growth', ['companion']);
  mockChannel = { data: undefined };
  mockSetup.data.whatsapp.connected = false;
});

describe('Settings on Free (no Clovie)', () => {
  beforeEach(() => {
    asOwner('free', ['inbox', 'whatsapp_menu']);
    mockChannel = { data: undefined };
  });

  it('hides Clovie and does not ask Nerova for the companion setup', () => {
    const out = text(mount());
    expect(out).not.toContain('Clovie |');
    expect(out).not.toContain('Clovie and WhatsApp');
    expect(mockSetupEnabled).toHaveBeenCalledWith(false);
    expect(mockSetupEnabled).not.toHaveBeenCalledWith(true);
    expect(mockChannelEnabled).toHaveBeenCalledWith(true);
  });

  it.each([
    [{ status: 'live', display_phone: '+27821234567' }, 'Connected · +27 82 123 4567'],
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
    expect(text(mount())).not.toContain('WhatsApp |');
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
    expect(out).toContain('WhatsApp | Not connected');
    expect(out).toContain('Plan | Growth');
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
    act(() => pressable(tree, 'Plan, Growth')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/plan');
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

describe('Settings as owner of a business with a plan', () => {
  it('shows Clovie as Live and WhatsApp from the companion setup', () => {
    const tree = mount();
    act(() => pressable(tree, 'Clovie, Live')?.props.onPress());
    expect(text(tree)).toContain('Clovie | Live');
    expect(mockPush).toHaveBeenCalledWith('/settings/companion');
    expect(mockPush).not.toHaveBeenCalledWith('/companion');
  });

  it('reads Connected once the number is connected', () => {
    mockSetup.data.whatsapp.connected = true;
    expect(text(mount())).toContain('WhatsApp | Connected');
  });

  it.each(['none', 'free'])(
    'never says Free, even for a leftover %s plan',
    (plan) => {
      asOwner(plan);
      expect(text(mount())).not.toMatch(/free/i);
    },
  );
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
    ['owner on a paid plan', () => asOwner('growth', ['companion'])],
    [
      'staff of a paid business',
      () => {
        mockMe.data = {
          role: 'staff',
          plan: 'growth',
          features: [{ feature: 'companion' }],
        };
      },
    ],
  ])('keeps all rows for %s', (_name, setup) => {
    expect(rowsFor(setup)).toEqual(ALL_ROWS);
  });

  it.each([
    ['an owner on Free', () => asOwner('free', ['inbox', 'whatsapp_menu'])],
    [
      'staff on Free',
      () => {
        mockMe.data = { role: 'staff', plan: 'free', features: [] };
      },
    ],
    [
      'a role that has not loaded',
      () => {
        mockMe.data = undefined;
      },
    ],
  ])('drops only the Clovie row for %s', (_name, setup) => {
    expect(rowsFor(setup)).toEqual(ALL_ROWS.filter((r) => r !== 'Clovie'));
  });

  it('is one list whatever the role, platform or plan', () => {
    expect(settingsGroups().flatMap((g) => g.items)).toHaveLength(
      ALL_ROWS.length,
    );
  });
});
