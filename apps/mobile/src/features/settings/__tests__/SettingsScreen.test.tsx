import '@/lib/i18n';

import * as React from 'react';
import renderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { OwnerOnly } from '@/features/business/components/OwnerOnly';

import { SettingsScreen } from '../components/SettingsScreen';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const mockPush = jest.fn();
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
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

const mockMe: {
  data:
    | { role: string; plan?: string; features?: { feature: string }[] }
    | undefined;
  isPending: boolean;
} = {
  data: { role: 'owner', plan: 'free', features: [] },
  isPending: false,
};
jest.mock('@/features/business/me', () => ({
  useMe: () => mockMe,
  useCanManage: () => mockMe.data?.role !== 'staff',
}));

jest.mock('@/features/business/hooks', () => ({
  useWhatsAppAccount: () => ({ data: { status: 'live' } }),
}));

jest.mock('@/features/catalog/hooks', () => ({
  useServices: () => ({ data: new Array(14).fill({}) }),
  useStaff: () => ({ data: new Array(4).fill({}) }),
}));

jest.mock('@/features/plans/components/Gate', () => ({
  Gate: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/features/auth/useSignOut', () => ({
  useSignOut: () => jest.fn(),
}));

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 402, height: 874 },
};

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>,
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

const labelled = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockMe.data = { role: 'owner', plan: 'free', features: [] };
  mockMe.isPending = false;
});

describe('Settings as owner', () => {
  it('lists the board groups with counts and the WhatsApp status', () => {
    const out = text(mount(<SettingsScreen />));
    expect(out).toContain('Settings');
    expect(out).toContain('Ashgrove Hair & Beauty');
    expect(out).toContain('Owner');
    for (const heading of ['Your business', 'Customize', 'Account']) {
      expect(out).toContain(heading);
    }
    for (const row of [
      'Business details',
      'Hours',
      'Services',
      'Team',
      'Booking rules',
      'WhatsApp',
      'Notifications',
    ]) {
      expect(out).toContain(row);
    }
    // Counts beside Services (14) and Team (4); WhatsApp reads Connected.
    expect(out).toContain('Services | 14');
    expect(out).toContain('Team | 4');
    expect(out).toContain('Connected');
    expect(out).toContain('Sign out');
    expect(out).toContain('Clovie 1.0.0 (24)');
  });

  it('opens Team on its own route', () => {
    const tree = mount(<SettingsScreen />);
    act(() => labelled(tree, 'Team, 4')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/team');
  });

  it('opens the business details from the profile row', () => {
    const tree = mount(<SettingsScreen />);
    act(() => labelled(tree, 'Ashgrove Hair & Beauty, Owner')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/business-details');
  });
});

describe('Settings by plan', () => {
  it('Free keeps the WhatsApp row and shows the plan as Free', () => {
    const out = text(mount(<SettingsScreen />));
    expect(out).toContain('WhatsApp');
    expect(out).not.toContain('Companion');
    expect(out).toContain('Plan | Free');
  });

  it('paid swaps WhatsApp for the Companion row and shows the plan name', () => {
    mockMe.data = {
      role: 'owner',
      plan: 'growth',
      features: [{ feature: 'companion' }, { feature: 'reports' }],
    };
    const tree = mount(<SettingsScreen />);
    const out = text(tree);
    expect(out).toContain('Companion');
    expect(out).not.toContain('WhatsApp');
    expect(out).toContain('Plan | Growth');
    act(() => labelled(tree, 'Companion')?.props.onPress());
    // The settings screen, never the chat itself.
    expect(mockPush).toHaveBeenCalledWith('/settings/companion');
    expect(mockPush).not.toHaveBeenCalledWith('/companion');
    act(() => labelled(tree, 'Plan, Growth')?.props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/settings/plan');
  });
});

describe('Settings as staff', () => {
  beforeEach(() => {
    mockMe.data = { role: 'staff' };
  });

  it('shows only the person, Notifications and Sign out', () => {
    const out = text(mount(<SettingsScreen />));
    expect(out).toContain('Thandi Mokoena');
    expect(out).toContain('Staff');
    expect(out).toContain('Notifications');
    expect(out).toContain('Sign out');
    for (const hidden of [
      'Your business',
      'Customize',
      'Business details',
      'Hours',
      'Services',
      'Team',
      'Booking rules',
      'WhatsApp',
      'Account',
    ]) {
      expect(out).not.toContain(hidden);
    }
  });

  it('does not open business details from the profile row', () => {
    const tree = mount(<SettingsScreen />);
    expect(labelled(tree, 'Thandi Mokoena, Staff')).toBeUndefined();
  });
});

describe('OwnerOnly', () => {
  it('renders an owner-only screen for the owner', () => {
    const out = text(
      mount(
        <OwnerOnly>
          <SettingsScreen />
        </OwnerOnly>,
      ),
    );
    expect(out).toContain('Business details');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('sends staff back to Settings and renders nothing of the screen', () => {
    mockMe.data = { role: 'staff' };
    const out = text(
      mount(
        <OwnerOnly>
          <SettingsScreen />
        </OwnerOnly>,
      ),
    );
    expect(mockRedirect).toHaveBeenCalledWith('/settings');
    expect(out).not.toContain('Sign out');
  });

  it('waits for the role before showing anything', () => {
    mockMe.data = undefined;
    mockMe.isPending = true;
    const out = text(
      mount(
        <OwnerOnly>
          <SettingsScreen />
        </OwnerOnly>,
      ),
    );
    expect(out).not.toContain('Business details');
  });
});
