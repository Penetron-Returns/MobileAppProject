import { Platform, type KeyboardAvoidingViewProps } from 'react-native';

/**
 * `behavior` for every `KeyboardAvoidingView`. Android draws edge to edge
 * (Expo SDK 57), so the system no longer resizes the window for the keyboard
 * and the view must pad itself, exactly like iOS. The web has no on-screen
 * keyboard to avoid.
 */
export function keyboardAvoidingBehavior(
  os: typeof Platform.OS = Platform.OS,
): KeyboardAvoidingViewProps['behavior'] {
  return os === 'web' ? undefined : 'padding';
}

export const KEYBOARD_AVOIDING_BEHAVIOR = keyboardAvoidingBehavior();
