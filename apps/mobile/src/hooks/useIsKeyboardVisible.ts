import * as React from 'react';
import { Keyboard, Platform } from 'react-native';

/** True while the software keyboard is on screen. */
export function useIsKeyboardVisible(): boolean {
  const [isVisible, setIsVisible] = React.useState(false);
  React.useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(
      ios ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsVisible(true),
    );
    const hide = Keyboard.addListener(
      ios ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return isVisible;
}
