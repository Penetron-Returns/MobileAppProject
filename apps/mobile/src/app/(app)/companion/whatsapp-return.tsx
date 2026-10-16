import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { qk } from '@/lib/query';
import { toast } from '@/lib/toast';

/**
 * Deep link `bookingadmin://companion/whatsapp-return?status=success|failure|cancelled`:
 * where the hosted WhatsApp connect page sends the owner back. Usually the
 * auth session consumes this URL and the SDK reads the status itself; this
 * route only runs when the link arrives as a plain deep link. Refetches the
 * setup state, says so on `failure`, then lands on the companion (the SDK
 * sheet reads the new connection status).
 */
export default function CompanionWhatsAppReturn() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { status } = useLocalSearchParams<{ status?: string | string[] }>();
  const outcome = Array.isArray(status) ? status[0] : status;
  const handled = React.useRef(false);
  React.useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    void queryClient.invalidateQueries({ queryKey: qk.companionSetup });
    if (outcome === 'failure') toast.info(t('companion.whatsAppFailed'));
  }, [queryClient, outcome, t]);
  return <Redirect href="/companion" />;
}
