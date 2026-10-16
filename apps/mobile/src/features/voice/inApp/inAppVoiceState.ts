/**
 * What the in-app voice drawer shows, as a pure function of the events the native service emits. No React, no native
 * module: the reducer is unit tested with plain objects. The drawer never decides anything itself; it only mirrors
 * the service (which keeps capture, transcription, cues, speech and follow-up exactly as in the overlay).
 */
import type {
  ClovieVoiceCommandOutcome,
  ClovieVoiceOutcomeEvent,
  ClovieVoiceStateEvent,
} from '../clovieVoice';

/** `closed`: nothing is shown. Otherwise the board's three states (the fourth, Show chat, closes the drawer). */
export type VoicePhase = 'closed' | 'listening' | 'thinking' | 'answer';

/** Which line the answer shows: the companion's own words, or one of our fixed strings. */
export type ReplyKind = 'text' | 'notHeard' | 'speechUnavailable' | 'couldNot';

export interface VoiceApproval {
  id: string;
  kind: string;
  title: string;
}

export interface InAppVoiceState {
  phase: VoicePhase;
  /** The words heard (the thinking chip). The cloud path has no partials, so while listening this stays empty. */
  transcript: string;
  reply: string;
  replyKind: ReplyKind;
  /** The one approval the service is holding, shown as the card. Null when there is none. */
  approval: VoiceApproval | null;
  /** The reply is being read aloud. */
  isReading: boolean;
  /** The microphone is open for an answer while the reply (or card) stays on screen. */
  isListening: boolean;
  /** The reply asked a question: the answer row offers the mic even with no approval card. */
  expectsReply: boolean;
}

export const INITIAL_VOICE_STATE: InAppVoiceState = {
  phase: 'closed',
  transcript: '',
  reply: '',
  replyKind: 'text',
  approval: null,
  isReading: false,
  isListening: false,
  expectsReply: false,
};

export type InAppVoiceAction =
  | { type: 'state'; event: ClovieVoiceStateEvent }
  | { type: 'transcript'; text: string }
  | { type: 'outcome'; event: ClovieVoiceOutcomeEvent }
  | { type: 'close' };

/** The text the service sends in place of a reply when nothing was heard / speech is missing on the phone. */
const NOT_HEARD = "Didn't catch that";
const SPEECH_UNAVAILABLE = 'speech_unavailable';

/** An outcome decided in JS (no service to emit it) as the event the drawer reducer takes. */
export function outcomeToEvent(
  outcome: ClovieVoiceCommandOutcome,
): ClovieVoiceOutcomeEvent {
  return {
    status: outcome.status,
    message: outcome.message,
    transcript: outcome.transcript ?? '',
    expectsReply: outcome.expectsReply === true,
    pendingApprovalId: outcome.pendingApprovalId ?? '',
    pendingKind: outcome.pendingKind ?? '',
    pendingTitle: outcome.pendingTitle ?? '',
    pendingRemaining: outcome.pendingRemaining ?? 0,
    reason: '',
  };
}

/** What to show for an outcome: the companion's words, or a fixed line for the cases with no usable words. */
export function replyFromOutcome(event: ClovieVoiceOutcomeEvent): {
  reply: string;
  replyKind: ReplyKind;
} {
  const message = event.message.trim();
  if (event.status === 'open_app' || event.status === 'fallback') {
    return { reply: '', replyKind: 'couldNot' };
  }
  if (message === SPEECH_UNAVAILABLE) {
    return { reply: '', replyKind: 'speechUnavailable' };
  }
  if (!message || message === NOT_HEARD) {
    return { reply: '', replyKind: 'notHeard' };
  }
  return { reply: message, replyKind: 'text' };
}

function onState(
  state: InAppVoiceState,
  event: ClovieVoiceStateEvent,
): InAppVoiceState {
  switch (event.state) {
    case 'listening':
      // A level tick: the waveform's own store handles it, the screen does not re-render.
      if (typeof event.level === 'number') return state;
      // A follow-up (the reply or its card is up) keeps its layout; the mic ring shows the microphone is open.
      if (state.phase === 'answer') {
        return { ...state, isListening: true, isReading: false };
      }
      return {
        ...INITIAL_VOICE_STATE,
        phase: 'listening',
        approval: state.approval,
      };
    case 'thinking':
      return {
        ...state,
        phase: 'thinking',
        isListening: false,
        isReading: false,
      };
    case 'speaking':
      return { ...state, phase: 'answer', isReading: true, isListening: false };
    case 'waiting':
      return {
        ...state,
        phase: 'answer',
        isReading: false,
        isListening: false,
      };
    case 'idle':
      return INITIAL_VOICE_STATE;
  }
}

export function inAppVoiceReducer(
  state: InAppVoiceState,
  action: InAppVoiceAction,
): InAppVoiceState {
  switch (action.type) {
    case 'state':
      return onState(state, action.event);
    case 'transcript':
      return state.phase === 'closed'
        ? state
        : { ...state, transcript: action.text };
    case 'outcome': {
      const { event } = action;
      const approval = event.pendingApprovalId
        ? {
            id: event.pendingApprovalId,
            kind: event.pendingKind,
            title: event.pendingTitle,
          }
        : null;
      return {
        ...state,
        phase: 'answer',
        ...replyFromOutcome(event),
        approval,
        expectsReply: event.expectsReply,
        transcript: event.transcript || state.transcript,
      };
    }
    case 'close':
      return INITIAL_VOICE_STATE;
  }
}

/** Whether the drawer is taller: the approval card needs the room (the board's 650 pt against 540 pt). */
export function drawerHeightFraction(state: InAppVoiceState): number {
  return state.phase === 'answer' && state.approval
    ? ANSWER_FRACTION
    : BASE_FRACTION;
}

/** The board's 540 and 650 pt drawers on its 874 pt screen. */
export const BASE_FRACTION = 540 / 874;
export const ANSWER_FRACTION = 650 / 874;
