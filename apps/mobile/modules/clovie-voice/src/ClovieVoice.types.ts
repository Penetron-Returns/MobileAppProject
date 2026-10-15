/** The foreground service's state. `starting` and `busy` (a command is being captured) both mean "on". */
export type ClovieVoiceStatus =
  | 'off'
  | 'not_configured'
  | 'starting'
  | 'listening'
  /** Hands-free is on but outside its conditions: the microphone is closed. */
  | 'standby'
  | 'busy'
  | 'error';

/** Why the status is `error`. */
export type ClovieVoiceError =
  | 'permission_denied'
  | 'background_start_blocked'
  | 'model_load_failed'
  | 'audio_failed'
  | 'inference_failed';

export interface ClovieVoiceState {
  status: ClovieVoiceStatus;
  error: ClovieVoiceError | null;
  /** What the owner says to wake it, for the UI ("Hey LiveKit" until hey_clovie.onnx is bundled). */
  wakePhrase: string;
}

export interface ClovieVoiceStartOptions {
  /** Overrides the bundled classifier: an asset path or an absolute file path to an .onnx. */
  classifierPath?: string;
  /** Detection threshold in (0, 1]. Default 0.5. */
  threshold?: number;
}

/**
 * What the app's headless task reports for a spoken command. "done" and "error" show the
 * message in the overlay; "open_app" offers an Open Clovie button (the owner finishes in the app).
 */
export interface ClovieVoiceCommandOutcome {
  status: 'done' | 'error' | 'open_app';
  message: string;
}

/** Why hands-free is (not) listening right now. */
export type ClovieVoiceDuty =
  'on_duty' | 'off_hours' | 'waiting_charger' | 'paused' | 'stopped';

export interface ClovieVoiceHandsFree {
  /** Hands-free is switched on (it may still be waiting for its conditions). */
  enabled: boolean;
  useOpeningHours: boolean;
  onlyWhileCharging: boolean;
  duty: ClovieVoiceDuty;
  /** When the current duty state is expected to change (epoch ms), if known. */
  untilMs: number | null;
  /** The end of the last opening window the app has handed over (epoch ms), if any. */
  windowsUntilMs: number | null;
}

export interface ClovieVoiceHandsFreeConfig {
  useOpeningHours?: boolean;
  onlyWhileCharging?: boolean;
  /** Business timezone, used for the times in the notification. */
  timezone?: string;
  /** Opening windows as [start0, end0, start1, end1, ...] in epoch ms. */
  windows?: number[];
}

export type ClovieVoiceTileResult =
  'added' | 'already' | 'dismissed' | 'unsupported' | 'error';
