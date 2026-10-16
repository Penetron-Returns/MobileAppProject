import { getDepth } from '@booking/ui';

import { buildCompanionAppearance } from '../sdk/companionAppearance';

describe('buildCompanionAppearance', () => {
  it.each([
    ['light', false],
    ['dark', true],
  ] as const)('maps the %s Depth tokens', (scheme, isDark) => {
    const depth = getDepth(scheme);
    const appearance = buildCompanionAppearance(depth, isDark);
    expect(appearance.colorMode).toBe(scheme);
    expect(appearance.colors?.primary).toBe(depth.colors.tint);
    expect(appearance.colors?.text).toBe(depth.colors.label);
    expect(appearance.colors?.destructive).toBe(depth.colors.red);
    expect(appearance.colors?.background).toBe(depth.ground.backgroundColor);
    expect(appearance.font).toBeUndefined();
  });
});
