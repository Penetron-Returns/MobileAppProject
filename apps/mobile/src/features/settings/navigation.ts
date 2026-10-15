import type { AppMode } from '@/features/plans/logic';

export type SettingsItem =
  | 'businessDetails'
  | 'hours'
  | 'services'
  | 'team'
  | 'rules'
  | 'whatsapp'
  | 'companion'
  | 'voice'
  | 'plan'
  | 'notifications';

export interface SettingsGroup {
  id: 'business' | 'customize' | 'account';
  items: SettingsItem[];
  /** Staff see one untitled group, as on the board's staff variant. */
  titled: boolean;
}

/**
 * What Settings lists, per the board (Settings.dc.html). Owners get "Your
 * business", "Customize" and "Account"; staff only an untitled group with
 * Notifications (the API refuses the rest anyway). Customize holds WhatsApp
 * on Free and the Companion on paid plans (`mode`); Account leads with Plan.
 * Hey Clovie (`options.hasVoice`, Android only) follows that row.
 * Extensions, connected apps and Help are not in v1 (docs/v1-scope.md).
 */
export function settingsGroups(
  isOwner: boolean,
  mode: AppMode = 'free',
  options: { hasVoice?: boolean } = {},
): SettingsGroup[] {
  if (!isOwner) {
    return [{ id: 'account', items: ['notifications'], titled: false }];
  }
  return [
    {
      id: 'business',
      items: ['businessDetails', 'hours', 'services', 'team', 'rules'],
      titled: true,
    },
    {
      id: 'customize',
      items: [
        mode === 'ai' ? 'companion' : 'whatsapp',
        ...(options.hasVoice ? (['voice'] as const) : []),
      ],
      titled: true,
    },
    { id: 'account', items: ['plan', 'notifications'], titled: true },
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
