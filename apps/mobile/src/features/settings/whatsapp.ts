import type { WhatsAppAccountStatus } from '@shared/api';

export type WhatsAppStateKey = WhatsAppAccountStatus | 'none';

/** One key for the channel's state: its account status, or `none` when nothing is connected. */
export function whatsAppStatusKey(channel: {
  connected: boolean;
  status: WhatsAppAccountStatus | null;
}): WhatsAppStateKey {
  if (!channel.status) return 'none';
  if (!channel.connected && channel.status === 'live') return 'none';
  return channel.status;
}
