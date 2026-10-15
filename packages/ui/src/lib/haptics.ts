import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * A light tap for a selection change (tab switch). Fire-and-forget: a device
 * without a haptic engine, or the web, just does nothing.
 */
export function lightHaptic(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // No haptic engine: nothing to do.
  }
}
