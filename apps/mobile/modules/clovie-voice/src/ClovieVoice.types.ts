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
  status: 'done' | 'error' | 'open_app' | 'fallback';
  message: string;
  /** What was heard, when the app transcribed a clip. */
  transcript?: string;
  /** Spoken instead of `message` when set (the reply plus the approval to confirm). Not shown. */
  spoken?: string;
  /** The service listens again (no wake word) after speaking: an approval is waiting, or the reply asks a question. */
  expectsReply?: boolean;
  /** The one approval just read aloud. A yes or no applies to this id only. */
  pendingApprovalId?: string;
  /** That approval's kind (`create_appointment`, ...), for the wording of the result. */
  pendingKind?: string;
  /** That approval's card title, for the in-app drawer's approval card. Not echoed back to the service. */
  pendingTitle?: string;
  /** JSON array of the approvals still to read, after the pending one: `[{ id, kind, title }]`. Echoed back as-is. */
  pendingQueue?: string;
  /** How many approvals are still queued after the pending one (lets the service allow a few more turns). */
  pendingRemaining?: number;
  /** The one executed action just read aloud (act-then-undo). "Undo" in the next utterance applies to this id only. */
  pendingActionId?: string;
  /** Epoch ms when that action's undo window closes. The service listens once more until then. */
  undoUntilMs?: number;
}

/** The owner's audio choices for voice replies. Both default to on. */
export interface ClovieVoiceFeedbackSettings {
  /** A distinct soft sound for waking, processing, success and failure. */
  sounds: boolean;
  /** Reads the reply aloud with the phone's own text-to-speech. */
  readAloud: boolean;
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

/** The device voice token the native service holds. `rejected`: the server refused it (401). */
export type ClovieVoiceTokenState = 'none' | 'ok' | 'rejected';

/**
 * What the in-app voice drawer draws. `waiting`: nothing is captured or spoken but an approval still waits for a
 * tap or the mic. `idle`: the interaction has ended, so the drawer closes.
 */
export type ClovieVoiceUiState =
  'listening' | 'thinking' | 'speaking' | 'waiting' | 'idle';

/** `onVoiceState`: a state change, or (state `listening`) a microphone level in 0..1, ~15 per second. */
export interface ClovieVoiceStateEvent {
  state: ClovieVoiceUiState;
  level?: number;
  /** Reserved; partial words arrive as `onVoiceTranscript` events while the owner speaks (on-device recogniser). */
  partialTranscript?: string;
}

/** `onVoiceTranscript`: what was heard so far (partials while speaking, on-device) and finally the whole command. */
export interface ClovieVoiceTranscriptEvent {
  text: string;
}

/**
 * `onVoiceLatency`: once per turn, milliseconds after the owner stopped speaking for each step that happened (a step
 * that did not happen is absent), plus how it ended. Numbers and short labels only: never a transcript or a name.
 */
export interface ClovieVoiceLatencyEvent {
  finalTranscriptMs?: number;
  requestSentMs?: number;
  firstReplyByteMs?: number;
  /** The short filler ("One sec"), usually the first word heard. */
  interimStartMs?: number;
  /** The reply's first word. */
  ttsStartMs?: number;
  /** What ended the speech: our endpointer on a stable partial, the recogniser, or the clip VAD. */
  endpoint?: string;
  /** `device` (Android recogniser) or `cloud` (clip transcribed by the backend). */
  sttPath?: string;
}

/** `onVoiceOutcome`: the finished command, with the approval the service now holds (if any). */
export interface ClovieVoiceOutcomeEvent {
  status: 'done' | 'error' | 'open_app' | 'fallback';
  message: string;
  transcript: string;
  expectsReply: boolean;
  pendingApprovalId: string;
  pendingKind: string;
  pendingTitle: string;
  pendingRemaining: number;
  /** The executed action the service is holding an undo window for; empty when none. */
  pendingActionId?: string;
  /** Epoch ms when its undo window closes; 0 when none. Absent from builds made before act-then-undo. */
  undoUntilMs?: number;
  reason: string;
}

/** A yes or no on the approval in the drawer. */
export type ClovieVoiceAnswer = 'yes' | 'no';

/** The on-device neural voice model: downloaded once, then used instead of the phone's own voice. */
export interface ClovieNeuralVoiceStatus {
  state: 'absent' | 'downloading' | 'ready' | 'failed';
  /** 0..1 while downloading. */
  progress: number;
}
