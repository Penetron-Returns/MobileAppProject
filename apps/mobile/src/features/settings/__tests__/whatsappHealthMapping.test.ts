import {
  KNOWN_SEND_FAILURE_CODES,
  META_BILLING_URL,
  paymentState,
  QUALITY_ICON,
  sendFailureWords,
} from '../whatsappHealth';
import en from '@/lib/i18n/locales/en-US.json';

const health = en.settings.whatsapp.health;

describe('sendFailureWords', () => {
  it.each(KNOWN_SEND_FAILURE_CODES)(
    'explains Meta code %s in plain words',
    (code) => {
      const words = sendFailureWords({
        code,
        title: null,
        count: 1,
        last_at: null,
      });
      expect(words).toEqual({
        key: `settings.whatsapp.health.failures.code.${code}`,
        values: {},
      });
      expect((health.failures.code as Record<string, string>)[code]).toMatch(
        /\w+ \w+/,
      );
    },
  );

  it('names an unknown code as Meta error <code>', () => {
    const words = sendFailureWords({
      code: '999999',
      title: 'Whatever',
      count: 2,
      last_at: null,
    });
    expect(words).toEqual({
      key: 'settings.whatsapp.health.failures.unknown',
      values: { code: '999999' },
    });
    expect(health.failures.unknown).toBe('Meta error {{code}}');
  });

  it('falls back to the title, then to a generic line, when there is no code', () => {
    expect(
      sendFailureWords({
        code: null,
        title: 'Rate limited',
        count: 1,
        last_at: null,
      }).values,
    ).toEqual({ title: 'Rate limited' });
    expect(
      sendFailureWords({ code: null, title: null, count: 1, last_at: null })
        .key,
    ).toBe('settings.whatsapp.health.failures.unknownNoCode');
  });
});

describe('paymentState', () => {
  const base = {
    connected: true,
    state: 'connected',
    display_phone_number: null,
    business_verified: true,
    business_verification_status: null,
  };
  it.each([
    [{ payment_method_attached: true, currency: 'USD' }, 'attached'],
    [{ payment_method_attached: false, currency: null }, 'missing'],
    [{ payment_method_attached: null, currency: null }, 'unknown'],
    [undefined, 'unknown'],
    [null, 'unknown'],
  ] as const)('%j is %s', (billing, expected) => {
    expect(paymentState({ ...base, billing })).toBe(expected);
  });
});

describe('quality, limit and links', () => {
  it('gives every quality its own icon so colour is never the only signal', () => {
    expect(new Set(Object.values(QUALITY_ICON)).size).toBe(3);
  });

  it("uses Meta's current messaging tiers", () => {
    expect(health.limit).toMatchObject({
      tier_250: '250 new conversations a day',
      tier_1k: '2,000 new conversations a day',
      tier_10k: '10,000 new conversations a day',
      tier_100k: '100,000 new conversations a day',
      unlimited: 'Unlimited',
    });
    expect(JSON.stringify(en)).not.toContain('1,000 new conversations');
  });

  it('points the payment help row at the Meta Billing hub', () => {
    expect(META_BILLING_URL).toBe(
      'https://business.facebook.com/latest/billing_hub/payment_methods/',
    );
  });
});
