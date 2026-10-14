import { useColorScheme } from 'nativewind';

import { getDepth, type DepthTokens } from '@/lib/depth';

/**
 * Depth tokens for the current colour scheme. Reads NativeWind's scheme
 * directly (the one `useAppColorScheme` persists), so it has no storage
 * dependency and is safe inside low-level primitives such as `Button`.
 */
export function useDepth(tint?: string): DepthTokens {
  const { colorScheme } = useColorScheme();
  return getDepth(colorScheme === 'dark' ? 'dark' : 'light', tint);
}
