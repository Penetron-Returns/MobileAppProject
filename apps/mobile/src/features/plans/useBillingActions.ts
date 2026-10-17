import type { PortalSessionDTO } from '@booking/types';
import * as WebBrowser from 'expo-web-browser';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';

import type { CheckoutPlanId } from './checkout';

/** "Manage subscription": mints a portal session and opens it in the in-app browser. */
export function useManageSubscription() {
  return useApiMutation<void, PortalSessionDTO>({
    mutationFn: (_vars, key) => api.createPortalSession(key),
    onSuccess: (session) => {
      void WebBrowser.openBrowserAsync(session.portal_url);
    },
  });
}

/** Switches an existing subscription to another paid plan (checkout is only for a first purchase). */
export function useChangePlan() {
  return useApiMutation<CheckoutPlanId>({
    mutationFn: (plan, key) => api.changePlan({ plan }, key),
    invalidate: [qk.me, qk.plans, ['billing-usage']],
  });
}
