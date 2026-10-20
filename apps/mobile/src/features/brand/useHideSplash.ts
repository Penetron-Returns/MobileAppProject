import * as React from 'react';

import { hideNativeSplash } from './splash';

/** Hides the native splash once a screen that is not the loading screen has rendered. */
export function useHideSplashWhen(isReady: boolean): void {
  React.useEffect(() => {
    if (isReady) hideNativeSplash();
  }, [isReady]);
}
