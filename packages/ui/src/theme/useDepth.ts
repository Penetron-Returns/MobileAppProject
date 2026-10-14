import { useColorScheme } from 'nativewind';
import * as React from 'react';

import { getDepth, type DepthTokens } from '../tokens/depth';
import { SchemeContext } from './SchemeScope';

/**
 * Depth tokens for the current colour scheme: the one forced by a
 * `SchemeScope`, otherwise NativeWind's (the one `useAppColorScheme`
 * persists), so it has no storage dependency and is safe inside low-level
 * primitives such as `Button`.
 */
export function useDepth(tint?: string): DepthTokens {
  const forced = React.useContext(SchemeContext);
  const { colorScheme } = useColorScheme();
  const scheme = forced ?? (colorScheme === 'dark' ? 'dark' : 'light');
  return getDepth(scheme, tint);
}
