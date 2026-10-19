import type { WhatsAppChannelDTO } from '@booking/types';

/** What the owner sees for the WhatsApp number of the booking menu. */
export type ChannelPill =
  | 'live'
  | 'pending'
  | 'paused'
  | 'needs_reauth'
  | 'not_connected';

/** `disconnected` and no account at all read the same: nothing is connected. */
export function channelPill(
  channel: Pick<WhatsAppChannelDTO, 'status'>,
): ChannelPill {
  const { status } = channel;
  return status === null || status === 'disconnected'
    ? 'not_connected'
    : status;
}

/** The one action the owner can take on the channel from here, if any. */
export function channelAction(pill: ChannelPill): 'pause' | 'resume' | null {
  if (pill === 'live') return 'pause';
  if (pill === 'paused') return 'resume';
  return null;
}
