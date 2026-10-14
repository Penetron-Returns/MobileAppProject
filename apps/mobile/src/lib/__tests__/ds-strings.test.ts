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

describe('design system strings in the app locale', () => {
  it.each(Object.entries(DS_STRINGS))(
    'translates %s the same as the package default',
    (key, expected) => {
      expect(lookup(key)).toBe(expected);
    },
  );
});
