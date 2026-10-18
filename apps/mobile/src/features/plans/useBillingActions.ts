import type { PortalSessionDTO } from '@booking/types';
import * as WebBrowser from 'expo-web-browser';

import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/query';

/** "Manage subscription": mints a portal session and opens it in the in-app browser. */
export function useManageSubscription() {
  return useApiMutation<void, PortalSessionDTO>({
    mutationFn: (_vars, key) => api.createPortalSession(key),
    onSuccess: (session) => {
      void WebBrowser.openBrowserAsync(session.portal_url);
    },
  });
}
