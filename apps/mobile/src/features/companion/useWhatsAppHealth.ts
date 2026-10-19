import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/**
 * The WhatsApp number's current health, read live from Nerova through our API. Not persisted to disk: health
 * is only useful fresh. Refetches when the app returns to the foreground, like the setup read.
 */
export function useWhatsAppHealth(opts: { enabled: boolean }) {
  return useQuery({
    queryKey: qk.companionWhatsAppHealth,
    queryFn: api.companionWhatsAppHealth,
    enabled: opts.enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: 'always',
  });
}
