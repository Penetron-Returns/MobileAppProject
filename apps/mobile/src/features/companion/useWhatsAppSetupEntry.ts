import * as React from 'react';

import { useConnectWhatsApp } from './hooks';
import { useCompanionSheet } from './sdk/companionSheetControl';

type ConnectHandlers = Parameters<typeof useConnectWhatsApp>[0];

/**
 * The one way every "Connect WhatsApp" button starts. While the SDK path is
 * active it hands over to Clovie's guided setup (the Clovie tab, or the sheet
 * on an SDK without the inline setup); with the SDK off or failed it falls
 * back to the hosted connect page in a browser tab (`useConnectWhatsApp`).
 */
export function useWhatsAppSetupEntry(handlers: ConnectHandlers) {
  const sheet = useCompanionSheet();
  const connect = useConnectWhatsApp(handlers);
  const { isAvailable, openSetup } = sheet;
  const { start } = connect;
  const begin = React.useCallback(() => {
    if (isAvailable) openSetup();
    else void start();
  }, [isAvailable, openSetup, start]);
  return {
    start: begin,
    isStarting: connect.isStarting,
    isGuided: isAvailable,
  };
}
