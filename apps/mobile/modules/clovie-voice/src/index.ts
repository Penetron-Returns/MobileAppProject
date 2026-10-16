import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type {
  ClovieVoiceCommandOutcome,
  ClovieVoiceFeedbackSettings,
  ClovieVoiceHandsFree,
  ClovieVoiceHandsFreeConfig,
  ClovieVoiceStartOptions,
  ClovieVoiceState,
  ClovieVoiceTileResult,
  ClovieVoiceTokenState,
} from './ClovieVoice.types';

export type * from './ClovieVoice.types';

type Events = { onStatusChange: (state: ClovieVoiceState) => void };

declare class ClovieVoiceNative extends NativeModule<Events> {
  isSupported(): boolean;
  getStatus(): ClovieVoiceState;
  start(options: ClovieVoiceStartOptions): Promise<ClovieVoiceState>;
  stop(): ClovieVoiceState;
  startTalk(): Promise<ClovieVoiceState>;
  configureHandsFree(config: ClovieVoiceHandsFreeConfig): void;
  getHandsFree(): ClovieVoiceHandsFree;
  requestAddTile(): Promise<ClovieVoiceTileResult>;
  setLauncherIconEnabled(enabled: boolean): void;
  isLauncherIconEnabled(): boolean;
  canDrawOverlays(): boolean;
  requestOverlayPermission(): void;
  completeCommand(
    id: string,
    status: string,
    message: string,
    transcript: string,
  ): boolean;
  setCloudStt(enabled: boolean): void;
  // Optional: older dev builds have no follow-up fields (see completeCommand).
  completeCommandWithReply?(
    id: string,
    status: string,
    message: string,
    transcript: string,
    extras: string,
  ): boolean;
  // Optional: a dev build made before these existed has no such functions.
  getFeedbackSettings?(): ClovieVoiceFeedbackSettings;
  setSoundsEnabled?(enabled: boolean): void;
  setReadAloudEnabled?(enabled: boolean): void;
  // Optional: a dev build made before this existed has no such function.
  speakInterim?(text: string): void;
  // Optional: a dev build made before these existed has no such functions.
  setVoiceToken?(token: string, apiUrl: string): void;
  clearVoiceToken?(): void;
  getVoiceTokenState?(): ClovieVoiceTokenState;
  getTimings(): Record<string, number | null>;
  // Optional: a dev build made before this existed has no such function.
  recordTiming?(key: string, ms: number): void;
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

/** Logs a step the app's JS measured next to the native timings (ClovieVoice logcat tag). Timings only. */
export function recordTiming(key: string, ms: number): void {
  native?.recordTiming?.(key, ms);
}

/** Reports a headless command's outcome to the service (shown in the overlay). */
export function completeCommand(
  id: string,
  outcome: ClovieVoiceCommandOutcome,
): boolean {
  const { spoken, expectsReply } = outcome;
  if (native?.completeCommandWithReply && (spoken || expectsReply)) {
    // Follow-up fields travel as one JSON string; a build made before they existed uses the plain call below.
    return native.completeCommandWithReply(
      id,
      outcome.status,
      outcome.message,
      outcome.transcript ?? '',
      JSON.stringify({
        spoken: spoken ?? '',
        expectsReply: expectsReply === true,
        pendingApprovalId: outcome.pendingApprovalId ?? '',
        pendingKind: outcome.pendingKind ?? '',
        pendingQueue: outcome.pendingQueue ?? '',
        pendingRemaining: outcome.pendingRemaining ?? 0,
      }),
    );
  }
  return (
    native?.completeCommand(
      id,
      outcome.status,
      outcome.message,
      outcome.transcript ?? '',
    ) ?? false
  );
}

/** Tells the service whether to capture its own clip for backend transcription. */
export function setCloudStt(enabled: boolean): void {
  native?.setCloudStt(enabled);
}

/**
 * Hands the service the scoped device voice token and the API base URL, so it can upload a clip
 * itself with no JS running. Stored encrypted natively. Returns false when the build predates it.
 */
export function setVoiceToken(token: string, apiUrl: string): boolean {
  if (!native?.setVoiceToken) return false;
  native.setVoiceToken(token, apiUrl);
  return true;
}

/** Forgets the token and URL (sign-out). */
export function clearVoiceToken(): void {
  native?.clearVoiceToken?.();
}

/** `rejected` means the server answered 401 to the service: mint a new token. */
export function getVoiceTokenState(): ClovieVoiceTokenState {
  return native?.getVoiceTokenState?.() ?? 'none';
}

/** "Sounds" and "Read replies aloud", as the service reads them. Both on until the owner turns them off. */
export function getFeedbackSettings(): ClovieVoiceFeedbackSettings {
  return native?.getFeedbackSettings?.() ?? { sounds: true, readAloud: true };
}

export function setSoundsEnabled(enabled: boolean): void {
  native?.setSoundsEnabled?.(enabled);
}

export function setReadAloudEnabled(enabled: boolean): void {
  native?.setReadAloudEnabled?.(enabled);
}

/** Speaks a short filler now, when read-aloud is on; the final reply queues behind it. No-op on older builds. */
export function speakInterim(text: string): void {
  native?.speakInterim?.(text);
}

/** One-tap: listens for one command now (no wake word). Call it while the app is on screen. */
export async function startTalk(): Promise<ClovieVoiceState> {
  return native ? native.startTalk() : UNSUPPORTED;
}

const HANDS_FREE_OFF: ClovieVoiceHandsFree = {
  enabled: false,
  useOpeningHours: true,
  onlyWhileCharging: false,
  duty: 'stopped',
  untilMs: null,
  windowsUntilMs: null,
};

/** Hands-free settings and its duty now, as the service sees them. */
export function getHandsFree(): ClovieVoiceHandsFree {
  return native?.getHandsFree() ?? HANDS_FREE_OFF;
}

/** Stores the conditions and the opening windows; the service re-checks at once if it is running. */
export function configureHandsFree(config: ClovieVoiceHandsFreeConfig): void {
  native?.configureHandsFree(config);
}

/** Asks Android to add the Quick Settings tile (Android 13+); older phones add it by hand. */
export async function requestAddTile(): Promise<ClovieVoiceTileResult> {
  return native ? native.requestAddTile() : 'unsupported';
}

export function setLauncherIconEnabled(enabled: boolean): void {
  native?.setLauncherIconEnabled(enabled);
}

export function isLauncherIconEnabled(): boolean {
  return native?.isLauncherIconEnabled() ?? false;
}
