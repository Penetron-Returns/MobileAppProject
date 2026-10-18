import * as React from 'react';
import { BackHandler } from 'react-native';

/**
 * Android hardware Back. A function runs on Back; `null` swallows Back so a
 * screen with nowhere to go does not exit the app; `undefined` leaves the
 * default behaviour (exit) alone.
 */
export function useHardwareBack(onBack: (() => void) | null | undefined) {
  const handler = React.useRef(onBack);
  handler.current = onBack;
  const isActive = onBack !== undefined;
  React.useEffect(() => {
    if (!isActive) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handler.current?.();
      return true;
    });
    return () => sub.remove();
  }, [isActive]);
}
