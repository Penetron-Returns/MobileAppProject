import {
  darken,
  getDepth,
  lighten,
  resolveSystemColor,
  systemColorKey,
  withAlpha,
} from '../depth';

describe('colour helpers', () => {
  it('lightens and darkens towards white and black', () => {
    expect(lighten('#007AFF', 0.08)).toBe('#1485FF');
    expect(darken('#007AFF', 0.06)).toBe('#0073F0');
  });

  it('expands short hex and falls back to the system blue for junk', () => {
    expect(withAlpha('#fff', 0.5)).toBe('rgba(255,255,255,0.5)');
    expect(withAlpha('not-a-colour', 1)).toBe('rgba(0,122,255,1)');
  });
});

describe('getDepth', () => {
  it('returns the approved light raised shadow', () => {
    expect(getDepth('light').raised.boxShadow).toBe(
      'inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 0.5px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.06), 0 6px 16px -6px rgba(16,24,40,0.10), 0 18px 36px -18px rgba(16,24,40,0.14)',
    );
  });

  it('returns the approved dark raised shadow and gradient', () => {
    const dark = getDepth('dark');
    expect(dark.raised.experimental_backgroundImage).toBe(
      'linear-gradient(180deg, #1C1D23 0%, #18191E 100%)',
    );
    expect(dark.raised.boxShadow).toContain('rgba(0,0,0,0.6)');
  });

  it('lifts the hero card more than a raised card', () => {
    const { hero, raised } = getDepth('light');
    expect(hero.boxShadow).not.toBe(raised.boxShadow);
  });

  it('builds the tactile primary from the tint', () => {
    const { primary } = getDepth('light', '#007AFF');
    expect(primary.experimental_backgroundImage).toBe(
      'linear-gradient(180deg, #298FFF 0%, #007AFF 55%, #006EE6 100%)',
    );
    expect(primary.boxShadow).toContain('rgba(0,122,255,0.45)');
  });

  it('swaps the system blue for its dark variant in dark mode only', () => {
    expect(getDepth('light').colors.tint).toBe('#007AFF');
    expect(getDepth('dark').colors.tint).toBe('#0A84FF');
    expect(getDepth('dark', '#C2410C').colors.tint).toBe('#C2410C');
  });

  it('keeps secondary text contrast at 0.72 alpha in both schemes', () => {
    expect(getDepth('light').colors.secondary).toBe('rgba(60,60,67,0.72)');
    expect(getDepth('dark').colors.secondary).toBe('rgba(235,235,245,0.72)');
  });

  it('provides a solid fallback colour for every gradient surface', () => {
    const tokens = getDepth('light');
    for (const key of ['ground', 'raised', 'hero', 'primary', 'bar'] as const) {
      expect(tokens[key].backgroundColor).toBeTruthy();
    }
  });

  it('is memoised per scheme and tint', () => {
    expect(getDepth('light')).toBe(getDepth('light'));
    expect(getDepth('light')).not.toBe(getDepth('dark'));
  });
});

describe('light and dark parity', () => {
  const light = getDepth('light');
  const dark = getDepth('dark');

  it('define the same tokens', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(Object.keys(dark.colors).sort()).toEqual(
      Object.keys(light.colors).sort(),
    );
  });

  it.each([
    'ground',
    'raised',
    'hero',
    'floating',
    'button',
    'knob',
    'primary',
    'inset',
    'dome',
    'domeFloat',
    'engrave',
    'bar',
    'pill',
    'badge',
  ] as const)('give %s a solid fallback colour in both schemes', (name) => {
    expect(light[name].backgroundColor).toBeDefined();
    expect(dark[name].backgroundColor).toBeDefined();
  });

  it('keeps all four capsule tones in both schemes', () => {
    for (const tone of ['neutral', 'amber', 'green', 'grey'] as const) {
      expect(light.capsule[tone].fill).toMatch(/^rgba\(/);
      expect(dark.capsule[tone].fill).toMatch(/^rgba\(/);
    }
  });

  it('swaps the system tint for its dark variant only', () => {
    expect(light.colors.tint).toBe('#007AFF');
    expect(dark.colors.tint).toBe('#0A84FF');
    expect(getDepth('dark', '#C2410C').colors.tint).toBe('#C2410C');
  });
});

describe('status and on-fill colours', () => {
  it.each(['light', 'dark'] as const)(
    'has a red for alerts and a white for content on a fill in %s',
    (scheme) => {
      const { colors } = getDepth(scheme);
      expect(colors.red).toMatch(/^#[0-9A-F]{6}$/);
      expect(colors.onFill).toBe('#FFFFFF');
    },
  );
});

describe('board tokens for the settings screens', () => {
  it('uses the board selected-segment and switch-thumb fills', () => {
    expect(getDepth('light').segment.experimental_backgroundImage).toBe(
      'linear-gradient(180deg, #FFFFFF 0%, #F4F5F8 100%)',
    );
    expect(getDepth('dark').segment.experimental_backgroundImage).toBe(
      'linear-gradient(180deg, #5A5C66 0%, #484A53 100%)',
    );
    expect(getDepth('light').thumb.experimental_backgroundImage).toBe(
      'linear-gradient(180deg, #FFFFFF 0%, #F6F6F9 100%)',
    );
    expect(getDepth('dark').thumb.experimental_backgroundImage).toBe(
      'linear-gradient(180deg, #FFFFFF 0%, #F1F1F4 100%)',
    );
  });

  it('frosts the back pill and fades the nav per scheme', () => {
    expect(getDepth('light').glass).toEqual({
      backgroundColor: 'rgba(255,255,255,0.62)',
      borderColor: 'rgba(255,255,255,0.7)',
      boxShadow:
        '0 4px 16px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
    });
    expect(getDepth('dark').glass.backgroundColor).toBe('rgba(40,40,42,0.62)');
    expect(getDepth('light').navFade.experimental_backgroundImage).toContain(
      'rgba(242,242,247,0.6) 72%',
    );
    expect(getDepth('dark').navFade.backgroundColor).toBe('rgba(0,0,0,0.6)');
  });

  it('uses the board red for destructive text', () => {
    expect(getDepth('light').colors.destructiveText).toBe('#D70015');
    expect(getDepth('dark').colors.destructiveText).toBe('#FF453A');
  });

  it('washes a picked time field in the tint at 15% light and 22% dark', () => {
    expect(getDepth('light').tintWash).toBe('rgba(0,122,255,0.15)');
    expect(getDepth('dark').tintWash).toBe('rgba(10,132,255,0.22)');
  });

  it('lights the ring avatar from above with the board shadow', () => {
    const { domeRing } = getDepth('light');
    expect(domeRing.experimental_backgroundImage).toContain('radial-gradient');
    expect(domeRing.boxShadow).toBe('0 1px 2px rgba(16,24,40,0.15)');
  });
});

describe('system colours', () => {
  it('finds the colour a stored hex stands for in either scheme', () => {
    expect(systemColorKey('#FF9500')).toBe('orange');
    expect(systemColorKey('#ff9f0a')).toBe('orange');
    expect(systemColorKey('#C2410C')).toBeNull();
    expect(systemColorKey(null)).toBeNull();
  });

  it('swaps system colours for their dark variant and leaves others alone', () => {
    expect(resolveSystemColor('#007AFF', 'dark')).toBe('#0A84FF');
    expect(resolveSystemColor('#0A84FF', 'light')).toBe('#007AFF');
    expect(resolveSystemColor('#C2410C', 'dark')).toBe('#C2410C');
    expect(resolveSystemColor(undefined, 'light')).toBeNull();
  });
});
