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
    expect(appearance.font?.family).toBe('System');
  });

  it('maps the type scale: body 17/22, caption and footnote 15/20, scaling capped', () => {
    const { type } = buildCompanionAppearance(getDepth('light'), false);
    expect(type?.body).toEqual({ fontSize: 17, lineHeight: 22 });
    expect(type?.caption).toEqual({ fontSize: 15, lineHeight: 20 });
    expect(type?.footnote).toEqual({ fontSize: 15, lineHeight: 20 });
    expect(type?.allowFontScaling).toBe(true);
    expect(type?.maxFontSizeMultiplier).toBe(1.3);
  });

  it('prefers Inter on Android, falling back to the system font', () => {
    const appearance = buildCompanionAppearance(
      getDepth('light'),
      false,
      'android',
    );
    expect(appearance.font?.family).toEqual(['Inter', 'System']);
  });
});

describe('buildCompanionAppearance owner bubble', () => {
  it('tints the owner bubble with white text', () => {
    const depth = getDepth('light');
    const { colors } = buildCompanionAppearance(depth, false);
    expect(colors?.userBubble).toBe(depth.colors.tint);
    expect(colors?.userBubbleText).toBe('#FFFFFF');
  });
});
