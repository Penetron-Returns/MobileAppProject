import { Text } from '@booking/ui';
import * as React from 'react';
import { AccessibilityInfo, findNodeHandle } from 'react-native';

/** The heading's ref type (the design system's Text). */
export type HeadingRef = React.Ref<React.ComponentRef<typeof Text>>;

/** Whether TalkBack / VoiceOver is on; null until the OS has answered. */
export function useScreenReaderEnabled(): boolean | null {
  const [isOn, setIsOn] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => alive && setIsOn(on))
      .catch(() => alive && setIsOn(false));
    const sub = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setIsOn,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return isOn;
}

/**
 * A ref for a screen's heading: once the screen reader is known to be on,
 * accessibility focus moves to it, so a screen change is announced from its
 * title instead of leaving focus on the (gone) previous screen.
 */
export function useFocusHeading() {
  const ref = React.useRef<React.ComponentRef<typeof Text>>(null);
  const isScreenReader = useScreenReaderEnabled();
  React.useEffect(() => {
    if (!isScreenReader) return;
    const node = ref.current ? findNodeHandle(ref.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [isScreenReader]);
  return ref;
}
