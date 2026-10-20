import * as fs from 'fs';
import * as path from 'path';

import {
  COLOR_ROLES,
  THEME,
  cssVariable,
  hsl,
  type ColorRole,
} from '../colors';

const GLOBAL_CSS = path.resolve(
  __dirname,
  '../../../../../apps/mobile/global.css',
);

/** Parses the `--name: value;` declarations inside a CSS block that starts at `selector`. */
function declarations(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const end = css.indexOf('\n  }', start);
  const block = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) out[m[1]] = m[2];
  return out;
}

describe('colour roles', () => {
  it('define the same roles in light and dark', () => {
    expect(Object.keys(COLOR_ROLES.dark).sort()).toEqual(
      Object.keys(COLOR_ROLES.light).sort(),
    );
  });

  it.each(['light', 'dark'] as const)(
    'write every %s role as HSL channels',
    (scheme) => {
      for (const value of Object.values(COLOR_ROLES[scheme])) {
        expect(value).toMatch(/^\d+ \d+% \d+%$/);
      }
    },
  );

  it.each([
    ['background', '--background'],
    ['mutedForeground', '--muted-foreground'],
    ['statusConfirmedSoft', '--status-confirmed-soft'],
  ] as [ColorRole, string][])('names the CSS variable of %s', (role, name) => {
    expect(cssVariable(role)).toBe(name);
  });

  it('turns channels into a raw hsl() colour', () => {
    expect(hsl('211 100% 50%')).toBe('hsl(211, 100%, 50%)');
  });

  it('derives the raw THEME colours from the roles', () => {
    expect(THEME.light.primary).toBe('hsl(211, 100%, 50%)');
    expect(THEME.dark.background).toBe('hsl(230, 22%, 6%)');
  });
});

describe('global.css', () => {
  const css = fs.readFileSync(GLOBAL_CSS, 'utf8');

  it.each([
    ['light', ':root'],
    ['dark', '.dark:root'],
  ] as const)(
    'declares the %s roles exactly as the tokens do',
    (scheme, selector) => {
      const declared = declarations(css, selector);
      delete declared['--radius'];
      const expected = Object.fromEntries(
        (Object.entries(COLOR_ROLES[scheme]) as [ColorRole, string][]).map(
          ([role, value]) => [cssVariable(role), value],
        ),
      );
      expect(declared).toEqual(expected);
    },
  );
});

describe('tailwind preset', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const preset = require('../../../tailwind-preset.cjs') as {
    theme: { extend: { colors: unknown; fontSize: Record<string, unknown> } };
  };

  it('only references colour roles that exist', () => {
    const roles = new Set(
      (Object.keys(COLOR_ROLES.light) as ColorRole[]).map(cssVariable),
    );
    const used = [
      ...JSON.stringify(preset.theme.extend.colors).matchAll(
        /var\((--[a-z-]+)\)/g,
      ),
    ].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(20);
    for (const name of used) expect(roles).toContain(name);
  });
});
