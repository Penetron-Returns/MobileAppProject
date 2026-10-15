import { useTranslation } from 'react-i18next';

/**
 * The few strings the design system owns (accessibility labels and the fixed
 * state screens), with their English defaults. The host app may translate
 * them by providing the same keys in its i18next resources; without them the
 * defaults show. A test in the app keeps its locale file in step with this
 * table (`strings.test.ts`).
 */
export const DS_STRINGS = {
  'common.back': 'Back',
  'common.close': 'Close',
  'common.dismiss': 'Dismiss',
  'common.retry': 'Try again',
  'common.cancel': 'Cancel',
  'common.search': 'Search',
  'common.clearSearch': 'Clear search',
  'errors.requestId': 'Reference: {{id}}',
  'errors.loadFailed': "Couldn't load this.",
  'states.loading': 'Loading',
  'states.blocked.title': "You're offline",
  'states.blocked.body':
    'New bookings need a connection so no one double-books the same time. Everything else you can still see.',
  'states.blocked.stillOffline': 'Still offline',
  'states.blocked.ok': 'OK',
  'states.blocked.tryAgain': 'Try again',
  'states.error.title': "Couldn't load this",
  'states.error.description': 'Check your connection and try again.',
  'tabs.today': 'Today',
  'tabs.calendar': 'Calendar',
  'tabs.add': 'New booking',
  'tabs.reports': 'Reports',
  'tabs.clients': 'Clients',
  'tabs.settings': 'Settings',
} as const;

export type DsStringKey = keyof typeof DS_STRINGS;

/** `t` for design system strings: the host's translation when it has one, the default otherwise. */
export function useDsText() {
  const { t } = useTranslation();
  return (key: DsStringKey, values?: Record<string, unknown>) =>
    t(key, { defaultValue: DS_STRINGS[key], ...values });
}
