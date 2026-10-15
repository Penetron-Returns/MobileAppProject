import type { PlanDTO } from '@booking/types';
import * as WebBrowser from 'expo-web-browser';

import i18n from '@/lib/i18n';
import { toast } from '@/lib/toast';

/**
 * The one place "Choose a plan" is handled. Purchase lives on the web and
 * `checkout_url` is null for now, so this tells the owner it is coming; once
 * the API returns a URL it opens secure checkout in the in-app browser and
 * nothing else in the app changes.
 */
export function startCheckout(plan: Pick<PlanDTO, 'checkout_url'>): void {
  if (plan.checkout_url) {
    void WebBrowser.openBrowserAsync(plan.checkout_url);
    return;
  }
  toast.info(i18n.t('plans.checkoutSoon'));
}
