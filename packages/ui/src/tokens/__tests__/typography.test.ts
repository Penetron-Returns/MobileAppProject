import { RADII } from '../radii';
import { LAYOUT, SPACING } from '../spacing';
import { TYPE_SCALE } from '../typography';
import { Z_INDEX } from '../zIndex';

describe('type scale', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const preset = require('../../../tailwind-preset.cjs') as {
    theme: {
      extend: {
        fontSize: Record<string, [string, { lineHeight: string }]>;
      };
    };
  };

  it.each([
    ['largeTitle', 'large-title'],
    ['section', 'section'],
    ['title', 'title'],
    ['subtitle', 'subtitle'],
    ['meta', 'meta'],
  ] as const)(
    'matches the %s utility in the tailwind preset',
    (step, utility) => {
      const [size, { lineHeight }] = preset.theme.extend.fontSize[utility];
      expect(size).toBe(`${TYPE_SCALE[step].size}px`);
      expect(lineHeight).toBe(`${TYPE_SCALE[step].lineHeight}px`);
    },
  );

  it('never goes under 13px, and 13px only for meta', () => {
    for (const [name, step] of Object.entries(TYPE_SCALE)) {
      expect(step.size).toBeGreaterThanOrEqual(13);
      if (name !== 'meta') expect(step.size).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('spacing, radii and stacking', () => {
  it('keeps spacing on the 4pt grid', () => {
    for (const points of Object.values(SPACING)) expect(points % 4).toBe(0);
  });

  it('keeps the smallest tap target at 44pt', () => {
    expect(LAYOUT.tapTarget).toBe(44);
  });

  it('orders radii from small to full', () => {
    const values = Object.values(RADII);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('stacks toasts above overlays above the tab bar', () => {
    expect(Z_INDEX.toast).toBeGreaterThan(Z_INDEX.overlay);
    expect(Z_INDEX.overlay).toBeGreaterThan(Z_INDEX.tabBar);
    expect(Z_INDEX.tabBar).toBeGreaterThan(Z_INDEX.pinned);
  });
});
