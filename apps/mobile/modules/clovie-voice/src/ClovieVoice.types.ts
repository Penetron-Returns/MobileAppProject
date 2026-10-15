/** The foreground service's state. `starting` and `busy` (a command is being captured) both mean "on". */
export type ClovieVoiceStatus =
  'off' | 'not_configured' | 'starting' | 'listening' | 'busy' | 'error';

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
