import type { CompanionSetupDTO } from '@booking/types';

import { mount, text } from '@/testing/render';

import { PaidWhatsAppSettings } from '../components/PaidWhatsAppSettings';

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: () => undefined,
}));
let mockRole: 'owner' | 'staff' = 'owner';
jest.mock('@/features/business/me', () => ({
  useMe: () => ({ data: { role: mockRole } }),
  useCanManage: () => mockRole !== 'staff',
}));
const mockStart = jest.fn();
jest.mock('@/features/companion/useWhatsAppSetupEntry', () => ({
  useWhatsAppSetupEntry: () => ({
    start: mockStart,
    isStarting: false,
    isGuided: true,
  }),
}));
const mockRefetch = jest.fn();
let mockData: CompanionSetupDTO | undefined;
jest.mock('@/features/companion/hooks', () => ({
  useCompanionSetup: () => ({
    data: mockData,
    isPending: !mockData,
    isError: false,
    refetch: mockRefetch,
  }),
}));
jest.mock('../hooks', () => ({
  useBookingRules: () => ({
    isPending: false,
    isError: false,
    data: { reminder_offsets_minutes: [1440] },
  }),
  useSaveBookingRules: () => ({ mutate: jest.fn(), isPending: false }),
}));

const setup = (
  over: Partial<CompanionSetupDTO> = {},
  wa: Partial<CompanionSetupDTO['whatsapp']> = {},
): CompanionSetupDTO => ({
  next_step: 'connect_whatsapp',
  whatsapp: {
    connected: false,
    state: 'not_connected',
    display_phone_number: null,
    business_verified: false,
    business_verification_status: null,
    ...wa,
  },
  provisioned: true,
  booking_connection: null,
  blocking_reasons: [
    'activation.channel_not_ready',
    'activation.consent_dataprocessing_missing',
  ],
  companion_live: false,
  ...over,
});

const press = (tree: ReturnType<typeof mount>, label: string) =>
  tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && !!n.props.onPress,
  )[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'owner';
  mockData = undefined;
});

describe('Settings > WhatsApp status', () => {
  it('shows no steps while loading', () => {
    expect(text(mount(<PaidWhatsAppSettings />))).not.toContain('To go live');
  });

  it('not connected: status, verification and both steps open the setup', () => {
    mockData = setup();
    const tree = mount(<PaidWhatsAppSettings />);
    const out = text(tree);
    expect(out).toContain('Not connected');
    expect(out).toContain('Not verified');
    expect(out).toContain('To go live');
    press(tree, 'Connect WhatsApp').props.onPress();
    press(tree, 'Go live').props.onPress();
    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it('connected with steps left: only Go live remains', () => {
    mockData = setup(
      {},
      {
        connected: true,
        state: 'connected',
        display_phone_number: '+27821234567',
        business_verification_status: 'pending',
      },
    );
    const tree = mount(<PaidWhatsAppSettings />);
    expect(text(tree)).toContain('Pending');
    expect(press(tree, 'Connect WhatsApp')).toBeUndefined();
    expect(press(tree, 'Go live')).toBeDefined();
  });

  it('live: says so and offers no steps', () => {
    mockData = setup(
      { companion_live: true, blocking_reasons: [] },
      { connected: true, state: 'connected', business_verified: true },
    );
    const tree = mount(<PaidWhatsAppSettings />);
    expect(text(tree)).toContain('Clovie is live on WhatsApp');
    expect(text(tree)).toContain('Verified');
    expect(press(tree, 'Go live')).toBeUndefined();
  });

  it('staff see the rows read-only with no actions', () => {
    mockRole = 'staff';
    mockData = setup();
    const tree = mount(<PaidWhatsAppSettings />);
    expect(text(tree)).toContain('Owner only');
    expect(text(tree)).not.toContain('To go live');
    expect(press(tree, 'Connect WhatsApp')).toBeUndefined();
  });

  it('owner sees the Health section only when health fields are present', () => {
    mockData = setup({}, { connected: true, state: 'connected' });
    expect(text(mount(<PaidWhatsAppSettings />))).not.toContain('Health');
    mockData = setup(
      {},
      { connected: true, state: 'connected', quality_rating: 'green' },
    );
    expect(text(mount(<PaidWhatsAppSettings />))).toContain(
      'Clients are happy with your messages',
    );
  });

  it('staff get no Health section', () => {
    mockRole = 'staff';
    mockData = setup({}, { quality_rating: 'red' });
    expect(text(mount(<PaidWhatsAppSettings />))).not.toContain(
      'Meta may limit your number',
    );
  });
});
