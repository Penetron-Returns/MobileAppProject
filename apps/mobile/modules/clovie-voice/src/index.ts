import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type {
  ClovieVoiceCommandOutcome,
  ClovieVoiceStartOptions,
  ClovieVoiceState,
} from './ClovieVoice.types';

export type * from './ClovieVoice.types';

type Events = { onStatusChange: (state: ClovieVoiceState) => void };

declare class ClovieVoiceNative extends NativeModule<Events> {
  isSupported(): boolean;
  getStatus(): ClovieVoiceState;
  start(options: ClovieVoiceStartOptions): Promise<ClovieVoiceState>;
  stop(): ClovieVoiceState;
  canDrawOverlays(): boolean;
  requestOverlayPermission(): void;
  completeCommand(id: string, status: string, message: string): boolean;
  getTimings(): Record<string, number | null>;
}

// Android only: iOS, web and builds without the native module get null.
const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<ClovieVoiceNative>('ClovieVoice')
    : null;

const UNSUPPORTED: ClovieVoiceState = {
  status: 'off',
  error: null,
  wakePhrase: '',
};

/** Whether "Hey Clovie" can run here (Android with the native module in the build). */
export function isSupported(): boolean {
  return native?.isSupported() ?? false;
}

export function getStatus(): ClovieVoiceState {
  return native?.getStatus() ?? UNSUPPORTED;
}

/**
 * Starts the foreground service. Call it only while the app is on screen:
 * Android refuses to start a microphone service from the background. The
 * result is the state right after the call; follow `addStatusListener` for
 * `listening` or an error.
 */
export async function start(
  options: ClovieVoiceStartOptions = {},
): Promise<ClovieVoiceState> {
  return native ? native.start(options) : UNSUPPORTED;
}

export function stop(): ClovieVoiceState {
  return native?.stop() ?? UNSUPPORTED;
}

/** Calls `listener` on every status change. Returns the unsubscribe function. */
export function addStatusListener(
  listener: (state: ClovieVoiceState) => void,
): () => void {
  if (!native) return () => undefined;
  const subscription = native.addListener('onStatusChange', listener);
  return () => subscription.remove();
}

/** Whether "Display over other apps" is granted: the voice overlay needs it. */
export function canDrawOverlays(): boolean {
  return native?.canDrawOverlays() ?? false;
}

/** Opens the system screen where the owner grants "Display over other apps". */
export function requestOverlayPermission(): void {
  native?.requestOverlayPermission();
}

/** Latency of the last voice interaction in ms: wakeToOverlayMs, sttMs, commandMs, totalMs. */
export function getTimings(): Record<string, number | null> {
  return native?.getTimings() ?? {};
}

/** Reports a headless command's outcome to the service (shown in the overlay). */
export function completeCommand(
  id: string,
  outcome: ClovieVoiceCommandOutcome,
): boolean {
  return native?.completeCommand(id, outcome.status, outcome.message) ?? false;
}
