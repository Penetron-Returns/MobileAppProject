import type { CompanionSetupDTO } from '@booking/types';

import { act, mount, text } from '@/testing/render';

import { WhatsAppHealthSection } from '../components/WhatsAppHealthSection';

jest.mock('@/lib/format', () => ({
  formatPhone: (v: string | null | undefined) => (v ? `fmt ${v}` : ''),
}));
const mockOpen = jest
  .spyOn(require('react-native').Linking, 'openURL')
  .mockResolvedValue(true);

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const NOW = new Date('2026-10-18T12:00:00Z');

const wa = (
  over: Partial<CompanionSetupDTO['whatsapp']> = {},
): CompanionSetupDTO['whatsapp'] => ({
  connected: true,
  state: 'connected',
  display_phone_number: null,
  business_verified: true,
  business_verification_status: null,
  ...over,
});

const render = (over: Partial<CompanionSetupDTO['whatsapp']>) =>
  mount(<WhatsAppHealthSection whatsapp={wa(over)} now={NOW} />);

describe('WhatsApp health section', () => {
  it('is hidden when Nerova sent no health fields', () => {
    expect(text(render({}))).toBe('');
    expect(text(render({ phone_number_status: 'unknown' }))).toBe('');
  });

  it.each([
    ['connected', 'Connected'],
    ['pending', 'Pending'],
    ['flagged', 'Flagged'],
    ['restricted', 'Restricted'],
    ['disconnected', 'Disconnected'],
  ] as const)('shows the %s number status', (status, label) => {
    const out = text(render({ phone_number_status: status }));
    expect(out).toContain('Health');
    expect(out).toContain('Number status');
    expect(out).toContain(label);
  });

  it.each([
    ['green', 'Green', 'Clients are happy with your messages'],
    ['yellow', 'Yellow', 'Some messages were blocked or reported'],
    ['red', 'Red', 'Meta may limit your number'],
  ] as const)('explains %s quality in one line', (quality, label, meaning) => {
    const tree = render({ quality_rating: quality });
    const out = text(tree);
    expect(out).toContain(label);
    expect(out).toContain(meaning);
    expect(
      tree.root.findAllByProps({ testID: 'quality-icon' }).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    ['tier_250', '250 new conversations a day'],
    ['tier_1k', '2,000 new conversations a day'],
    ['tier_10k', '10,000 new conversations a day'],
    ['tier_100k', '100,000 new conversations a day'],
    ['unlimited', 'Unlimited'],
  ] as const)('shows the %s message limit', (tier, label) => {
    expect(text(render({ messaging_limit_tier: tier }))).toContain(label);
  });

  it('hides rows whose value is unknown', () => {
    const out = text(
      render({ quality_rating: 'unknown', messaging_limit_tier: 'tier_250' }),
    );
    expect(out).not.toContain('Message quality');
    expect(out).toContain('Message limit');
  });

  it('shows the verified name with its review status', () => {
    const out = text(
      render({ verified_name: 'Harbour Salon', name_status: 'pending_review' }),
    );
    expect(out).toContain('Harbour Salon');
    expect(out).toContain('In review');
  });

  it('summarises templates and opens the list with rejected reasons', () => {
    const tree = render({
      templates: [
        {
          name: 'reminder',
          category: 'utility',
          status: 'approved',
          rejected_reason: null,
        },
        {
          name: 'welcome',
          category: 'utility',
          status: 'approved',
          rejected_reason: null,
        },
        {
          name: 'sale',
          category: 'marketing',
          status: 'pending',
          rejected_reason: null,
        },
        {
          name: 'promo',
          category: 'marketing',
          status: 'rejected',
          rejected_reason: 'Unclear opt-in',
        },
      ],
    });
    expect(text(tree)).toContain('2 approved, 1 in review, 1 rejected');
    expect(text(tree)).not.toContain('Unclear opt-in');
    const toggle = tree.root.findAll(
      (n) =>
        !!n.props.onPress &&
        String(n.props.accessibilityLabel ?? '').startsWith(
          'Message templates',
        ),
    )[0];
    act(() => toggle?.props.onPress());
    const out = text(tree);
    expect(out).toContain('promo');
    expect(out).toContain('Unclear opt-in');
    expect(out).toContain('Rejected');
  });

  it('shows the last problem with a relative time and where to fix it', () => {
    const out = text(
      render({
        last_error: {
          code: '131047',
          message: 'Message failed to send',
          at: '2026-10-18T10:00:00Z',
        },
      }),
    );
    expect(out).toContain('Last problem');
    expect(out).toContain('Message failed to send');
    expect(out).toContain('2 hours ago');
    expect(out).toContain('Meta WhatsApp Manager');
  });

  it('has no problem row when last_error is null', () => {
    expect(
      text(render({ phone_number_status: 'connected', last_error: null })),
    ).not.toContain('Last problem');
  });

  it('shows when health was last checked', () => {
    expect(
      text(render({ last_health_check_at: '2026-10-18T11:57:00Z' })),
    ).toContain('Checked 3 minutes ago');
  });

  it('shows the connected number with its status', () => {
    const out = text(
      render({
        phone_number_status: 'connected',
        display_phone_number: '+27821234567',
      }),
    );
    expect(out).toContain('fmt +27821234567');
  });

  it('shows the payment method with its currency', () => {
    const out = text(
      render({ billing: { payment_method_attached: true, currency: 'ZAR' } }),
    );
    expect(out).toContain('Payment method');
    expect(out).toContain('Added (ZAR)');
    expect(out).not.toContain('How to add a payment method');
  });

  it('flags a missing payment method and opens Meta billing from the help row', () => {
    const tree = render({
      billing: { payment_method_attached: false, currency: null },
    });
    const out = text(tree);
    expect(out).toContain('Missing');
    expect(out).toContain('Easier on a computer');
    const row = tree.root.findAll(
      (n) =>
        !!n.props.onPress &&
        String(n.props.accessibilityLabel ?? '').startsWith(
          'How to add a payment method',
        ),
    )[0];
    act(() => row?.props.onPress());
    expect(mockOpen).toHaveBeenCalledWith(
      'https://business.facebook.com/latest/billing_hub/payment_methods/',
    );
  });

  it('lists recent send failures in plain words and unknown codes as Meta error', () => {
    const out = text(
      render({
        recent_send_failures: [
          {
            code: '131047',
            title: 'x',
            count: 3,
            last_at: '2026-10-18T10:00:00Z',
          },
          { code: '999999', title: null, count: 1, last_at: null },
        ],
      }),
    );
    expect(out).toContain('Recent send problems');
    expect(out).toContain('need an approved template');
    expect(out).toContain('3 in the last 7 days, latest 2 hours ago');
    expect(out).toContain('Meta error 999999');
    expect(out).toContain('1 time in the last 7 days');
  });

  it('shows a skeleton while the live read loads and a note when it reports nothing', () => {
    const loading = mount(
      <WhatsAppHealthSection whatsapp={wa()} now={NOW} load="loading" />,
    );
    expect(text(loading)).toContain('Health');
    const empty = text(
      mount(<WhatsAppHealthSection whatsapp={wa()} now={NOW} load="loaded" />),
    );
    expect(empty).toContain('Nothing reported yet');
    expect(
      text(
        mount(
          <WhatsAppHealthSection
            whatsapp={wa({ connected: false })}
            now={NOW}
            load="loaded"
          />,
        ),
      ),
    ).toBe('');
  });

  it('offers a retry when the live read fails', () => {
    const onRetry = jest.fn();
    const tree = mount(
      <WhatsAppHealthSection
        whatsapp={wa()}
        now={NOW}
        load="error"
        error={new Error('boom')}
        onRetry={onRetry}
      />,
    );
    expect(text(tree)).toContain('Health');
    expect(
      tree.root.findAll((n) => n.props.onRetry === onRetry).length,
    ).toBeGreaterThan(0);
  });
});
