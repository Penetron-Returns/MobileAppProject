import { Platform } from 'react-native';
import { useAnimatedKeyboard, useSharedValue } from 'react-native-reanimated';

/** The web has no on-screen keyboard to follow. */
function useNoKeyboardHeight() {
  return useSharedValue(0);
}

function useAnimatedKeyboardHeight() {
  return useAnimatedKeyboard().height;
}

/**
 * The keyboard's height as a shared value that follows it frame by frame on the
 * UI thread (no JS round trip, so no jump when it opens on mount). Part of
 * Reanimated: no native module to add. The platform never changes at runtime,
 * so the hook order is stable.
 */
export const useKeyboardHeight =
  Platform.OS === 'web' ? useNoKeyboardHeight : useAnimatedKeyboardHeight;
