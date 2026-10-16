import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import * as React from 'react';

import { qk } from '@/lib/query';

/**
 * Deep link `bookingadmin://companion/whatsapp-return`: where the hosted
 * WhatsApp connect page sends the owner back. Refetches the setup state, then
 * lands on the companion (the SDK sheet reads the new connection status).
 */
export default function CompanionWhatsAppReturn() {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: qk.companionSetup });
  }, [queryClient]);
  return <Redirect href="/companion" />;
}
