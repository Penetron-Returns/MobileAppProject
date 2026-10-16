import { DS_STRINGS } from '@booking/ui';

import enUS from '../i18n/locales/en-US.json';

function lookup(path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      enUS,
    );
}

// The app renamed the Today tab to Home; the package default keeps its generic wording.
const APP_OVERRIDES: Record<string, string> = { 'tabs.today': 'Home' };

describe('design system strings in the app locale', () => {
  it.each(Object.entries({ ...DS_STRINGS, ...APP_OVERRIDES }))(
    'translates %s the same as the package default',
    (key, expected) => {
      expect(lookup(key)).toBe(expected);
    },
  );
});
