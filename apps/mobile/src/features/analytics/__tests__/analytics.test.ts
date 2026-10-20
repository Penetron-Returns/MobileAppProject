import { analytics, createAnalytics, setAnalytics } from '..';
import { safeProperties } from '../events';
import { createFakeAnalytics } from '../testing';

afterEach(() => setAnalytics());

describe('analytics port', () => {
  it('does nothing and never throws when no key is configured', () => {
    const adapter = createAnalytics({
      key: '',
      host: 'https://eu.i.posthog.com',
    });
    expect(() => {
      adapter.track('onboarding_started');
      adapter.identify('user_1');
      adapter.group('business', 'b_1');
      adapter.reset();
    }).not.toThrow();
  });

  it('is a no-op until an adapter is installed', () => {
    expect(() => analytics.track('business_created')).not.toThrow();
  });

  it('forwards to the installed adapter and back to no-op when cleared', () => {
    const fake = createFakeAnalytics();
    setAnalytics(fake);
    analytics.track('onboarding_type_selected', { type: 'salon' });
    analytics.identify('user_1');
    analytics.group('business', 'b_1');
    expect(fake.events).toEqual([
      { event: 'onboarding_type_selected', props: { type: 'salon' } },
    ]);
    expect(fake.identified).toEqual(['user_1']);
    expect(fake.groups).toEqual([{ type: 'business', id: 'b_1' }]);
    setAnalytics();
    analytics.track('business_created');
    expect(fake.names()).toEqual(['onboarding_type_selected']);
  });
});

describe('safeProperties', () => {
  it('keeps the enum-like type only', () => {
    expect(safeProperties({ type: 'salon', plan: 'pro' })).toEqual({
      type: 'salon',
    });
  });

  it('drops names, emails, phones and unknown keys', () => {
    expect(
      safeProperties({
        name: "Thandi's Hair Studio",
        email: 'a@b.co',
        phone: '+27821234567',
        business_name: 'Studio',
        type: 'Thandi@x.com',
      }),
    ).toEqual({});
  });

  it('handles no properties', () => {
    expect(safeProperties(undefined)).toEqual({});
  });
});
