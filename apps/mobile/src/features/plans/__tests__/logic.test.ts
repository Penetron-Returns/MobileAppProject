import type { FeatureEntitlementDTO } from '@shared/api';

import { hasFeature, monthlyLimit } from '../logic';

const growth: FeatureEntitlementDTO[] = [
  { feature: 'companion', monthly_limit: null },
  { feature: 'desktop_app', monthly_limit: null },
  { feature: 'assistant_bookings', monthly_limit: 250 },
];

describe('hasFeature', () => {
  it('is true only for features in the list', () => {
    expect(hasFeature(growth, 'companion')).toBe(true);
    expect(hasFeature(growth, 'assistant_bookings')).toBe(true);
    expect(hasFeature(growth, 'inbox')).toBe(false);
    expect(hasFeature(growth, 'whatsapp_menu')).toBe(false);
  });

  it('fails closed when entitlements are not loaded or empty', () => {
    expect(hasFeature(undefined, 'inbox')).toBe(false);
    expect(hasFeature([], 'inbox')).toBe(false);
  });
});

describe('monthlyLimit', () => {
  it('returns the cap when set', () => {
    expect(monthlyLimit(growth, 'assistant_bookings')).toBe(250);
  });

  it('returns null for uncapped, absent and unloaded', () => {
    expect(monthlyLimit(growth, 'companion')).toBeNull();
    expect(monthlyLimit(growth, 'inbox')).toBeNull();
    expect(monthlyLimit(undefined, 'companion')).toBeNull();
  });
});
