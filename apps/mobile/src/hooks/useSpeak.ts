import * as React from 'react';

import { speak, stopSpeaking } from '@/lib/speech';

/** Reads `text` aloud; calling `toggle` while it is playing stops it. Stops when the screen goes away. */
export function useSpeak(text: string) {
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const alive = React.useRef(true);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopSpeaking();
    };
  }, []);

  const toggle = React.useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    speak(text, {
      onDone: () => {
        if (alive.current) setIsSpeaking(false);
      },
    });
  }, [isSpeaking, text]);

  return { isSpeaking, toggle };
}
