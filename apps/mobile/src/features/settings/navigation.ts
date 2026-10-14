export type SettingsItem =
  'businessDetails' | 'hours' | 'services' | 'team' | 'rules' | 'notifications';

export interface SettingsGroup {
  id: 'business' | 'account';
  items: SettingsItem[];
}

/**
 * What Settings lists. Owners get "Your business" and "Account"; staff only
 * "Account" (the API refuses the rest anyway). WhatsApp sits between them and
 * is added by the screen behind the `whatsapp_menu` gate. Extensions, connected
 * apps and plan are not in v1 (docs/v1-scope.md).
 */
export function settingsGroups(isOwner: boolean): SettingsGroup[] {
  const account: SettingsGroup = { id: 'account', items: ['notifications'] };
  if (!isOwner) return [account];
  return [
    {
      id: 'business',
      items: ['businessDetails', 'hours', 'services', 'team', 'rules'],
    },
    account,
  ];
}
