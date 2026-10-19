import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';

/** The channel status from `GET /v1/whatsapp`: the booking menu's own number, no companion involved. */
export function useWhatsAppChannel(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.whatsappChannel,
    queryFn: api.whatsapp,
    enabled: opts.enabled ?? true,
  });
}

/** Pause or resume the booking menu on WhatsApp (owner only; the API enforces it). */
export function useWhatsAppChannelAction() {
  return useApiMutation<'pause' | 'resume'>({
    mutationFn: (action, key) => api.whatsappAction(action, key),
    invalidate: [qk.whatsapp],
  });
}
