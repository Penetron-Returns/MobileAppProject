export type SettingsItem =
  | 'businessDetails'
  | 'hours'
  | 'services'
  | 'team'
  | 'rules'
  | 'whatsapp'
  | 'notifications';

export interface SettingsGroup {
  id: 'business' | 'customize' | 'account';
  items: SettingsItem[];
  /** Staff see one untitled group, as on the board's staff variant. */
  titled: boolean;
}

/**
 * What Settings lists, per the board (Settings.dc.html). Owners get "Your
 * business", "Customize" (WhatsApp, behind the `whatsapp_menu` gate in the
 * screen) and "Account"; staff only an untitled group with Notifications (the
 * API refuses the rest anyway). Extensions, connected apps, plan and Help are
 * not in v1 (docs/v1-scope.md).
 */
export function settingsGroups(isOwner: boolean): SettingsGroup[] {
  if (!isOwner) {
    return [{ id: 'account', items: ['notifications'], titled: false }];
  }
  return [
    {
      id: 'business',
      items: ['businessDetails', 'hours', 'services', 'team', 'rules'],
      titled: true,
    },
    { id: 'customize', items: ['whatsapp'], titled: true },
    { id: 'account', items: ['notifications'], titled: true },
  ];
}

/** "Booking 1.0.0 (24)": app name, version and the native build when there is one. */
export function appVersionLabel(
  name: string,
  version: string,
  build: string | null,
): string {
  return build ? `${name} ${version} (${build})` : `${name} ${version}`;
}
