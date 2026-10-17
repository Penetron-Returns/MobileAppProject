import * as Speech from 'expo-speech';

import i18n from '@/lib/i18n';

/** Read-aloud: the platform text-to-speech voice, in the app's language. Starting a line stops the previous one. */
export interface SpeakHandlers {
  onDone: () => void;
}

export function speak(text: string, handlers: SpeakHandlers): void {
  void Speech.stop();
  Speech.speak(text, {
    language: i18n.language || 'en-US',
    onDone: handlers.onDone,
    onStopped: handlers.onDone,
    onError: handlers.onDone,
  });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
