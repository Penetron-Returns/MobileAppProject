export type SettingsItem =
  | 'businessDetails'
  | 'hours'
  | 'services'
  | 'rules'
  | 'team'
  | 'whatsapp'
  | 'notifications'
  | 'appearance'
  | 'haptics'
  | 'deleteAccount';

export interface SettingsGroup {
  id: 'business' | 'channel' | 'account';
  items: SettingsItem[];
}

/**
 * What Settings lists. One list for everyone: the role decides whether a row
 * can be changed, never whether it is shown, so nothing is ever hidden. Rows
 * an owner alone may change open read-only for staff; the API enforces the
 * role. Client reminders live on the WhatsApp screen (two levels at most).
 */
export function settingsGroups(): SettingsGroup[] {
  return [
    {
      id: 'business',
      items: ['businessDetails', 'hours', 'services', 'rules', 'team'],
    },
    { id: 'channel', items: ['whatsapp'] },
    {
      id: 'account',
      items: ['notifications', 'appearance', 'haptics', 'deleteAccount'],
    },
  ];
}

export const SETTINGS_ROUTES: Record<
  Exclude<SettingsItem, 'appearance' | 'haptics'>,
  string
> = {
  businessDetails: '/settings/business-details',
  hours: '/settings/operating-hours',
  services: '/settings/services',
  rules: '/settings/booking-rules',
  team: '/settings/team',
  whatsapp: '/settings/whatsapp',
  notifications: '/settings/notifications',
  deleteAccount: '/settings/delete-account',
};

/** "Booking 1.0.0 (24)": app name, version and the native build when there is one. */
export function appVersionLabel(
  name: string,
  version: string,
  build: string | null,
): string {
  return build ? `${name} ${version} (${build})` : `${name} ${version}`;
}
