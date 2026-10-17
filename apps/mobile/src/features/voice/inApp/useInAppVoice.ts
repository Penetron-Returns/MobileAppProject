import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, BackHandler, Platform } from 'react-native';

import { api, newIdempotencyKey } from '@/lib/api';

import { recallAction } from '../actionStore';
import { answerPendingApproval } from '../ask';
import {
  addVoiceOutcomeListener,
  addVoiceStateListener,
  addVoiceTranscriptListener,
  answerApproval,
  cancel,
  endVoice,
  listenAgain,
  setAppForeground,
  setVoiceUiAttached,
  startTalk,
  stopListening,
  supportsInAppVoice,
  undoAction,
  type ClovieVoiceAnswer,
} from '../clovieVoice';
import { undoPendingAction } from '../undo';
import {
  INITIAL_VOICE_STATE,
  inAppVoiceReducer,
  outcomeToEvent,
  type InAppVoiceState,
} from './inAppVoiceState';
import { createLevelStore, type LevelStore } from './levelStore';
import type { VoiceActions } from './VoiceStates';

/** How long a result decided without the service (it had already gone) stays up before the drawer closes. */
const LOCAL_RESULT_MS = 2500;

/** Whether this device and build can show voice inside the app. */
export function isInAppVoiceSupported(): boolean {
  return Platform.OS === 'android' && supportsInAppVoice();
}

export interface InAppVoice {
  state: InAppVoiceState;
  levels: LevelStore;
  actions: VoiceActions;
}

/**
 * Connects the native voice service to the drawer while the app is open: reports AppState and that a drawer is
 * mounted (so the service skips its system overlay), turns the service's events into drawer state, and maps the
 * drawer's buttons back to native calls. Approve and Decline go through `answerApproval`, which applies them to the
 * approval the service is holding, by id. Only if the service has already ended is the approval decided directly by
 * the same id through the voice API (the same call the spoken yes or no makes), never "the latest pending".
 */
export function useInAppVoice({
  onShowChat,
}: {
  onShowChat: () => void;
}): InAppVoice {
  const { t } = useTranslation();
  const [state, dispatch] = React.useReducer(
    inAppVoiceReducer,
    INITIAL_VOICE_STATE,
  );
  const levels = React.useMemo(createLevelStore, []);
  const isOpenRef = React.useRef(false);
  isOpenRef.current = state.phase !== 'closed';
  const approvalRef = React.useRef(state.approval);
  approvalRef.current = state.approval;
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const isSupported = isInAppVoiceSupported();

  const close = React.useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    levels.reset();
    dispatch({ type: 'close' });
  }, [levels]);

  // Foreground: told to the service, and a drawer left open when the app is backgrounded is closed (the service
  // would otherwise keep the microphone open behind a screen nobody sees).
  React.useEffect(() => {
    if (!isSupported) return;
    setAppForeground(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', (next) => {
      setAppForeground(next === 'active');
      if (next !== 'active' && isOpenRef.current) {
        endVoice();
        close();
      }
    });
    return () => sub.remove();
  }, [isSupported, close]);

  // Events in, then "attached": the service must never emit to a drawer that is not listening yet.
  React.useEffect(() => {
    if (!isSupported) return;
    const offs = [
      addVoiceStateListener((event) => {
        if (event.state === 'listening' && typeof event.level === 'number') {
          levels.push(event.level);
          return;
        }
        if (event.state === 'listening' || event.state === 'idle') {
          levels.reset();
        }
        dispatch({ type: 'state', event });
      }),
      addVoiceTranscriptListener(({ text }) =>
        dispatch({ type: 'transcript', text }),
      ),
      addVoiceOutcomeListener((event) => {
        // The event names the executed action and its window; its lines are what the headless task just kept.
        const executed = event.pendingActionId
          ? recallAction(event.pendingActionId)
          : undefined;
        dispatch({
          type: 'outcome',
          event,
          ...(executed
            ? { action: { title: executed.title, lines: executed.lines } }
            : {}),
        });
      }),
    ];
    setVoiceUiAttached(true);
    return () => {
      setVoiceUiAttached(false);
      offs.forEach((off) => off());
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (isOpenRef.current) endVoice();
    };
  }, [isSupported, levels]);

  React.useEffect(() => {
    if (state.phase === 'closed') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      endVoice();
      close();
      return true;
    });
    return () => sub.remove();
  }, [state.phase, close]);

  const decide = React.useCallback(
    async (id: string, answer: ClovieVoiceAnswer) => {
      if (answerApproval(id, answer)) return;
      const outcome = await answerPendingApproval(
        answer,
        { pendingApprovalId: id, pendingKind: approvalRef.current?.kind ?? '' },
        {
          t,
          ask: () => Promise.reject(new Error('not used')),
          decide: (approvalId, decision) =>
            api.voiceDecideApproval(approvalId, decision, newIdempotencyKey()),
        },
      );
      dispatch({ type: 'outcome', event: outcomeToEvent(outcome) });
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (!outcome.pendingApprovalId) {
        closeTimer.current = setTimeout(close, LOCAL_RESULT_MS);
      }
    },
    [t, close],
  );

  // Undo goes through the service like a spoken "undo" (it holds the action id). Only if the service has already
  // ended is exactly that id undone directly, the same call the voice path makes.
  const undo = React.useCallback(
    async (id: string) => {
      if (undoAction(id)) return;
      const outcome = await undoPendingAction(id, {
        t,
        undo: (actionId) =>
          api.voiceUndoAction(actionId, `action:${actionId}:undo`),
      });
      dispatch({ type: 'outcome', event: outcomeToEvent(outcome) });
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(close, LOCAL_RESULT_MS);
    },
    [t, close],
  );

  const actions = React.useMemo<VoiceActions>(
    () => ({
      stop: stopListening,
      cancel,
      approve: (id) => void decide(id, 'yes'),
      decline: (id) => void decide(id, 'no'),
      undo: (id) => void undo(id),
      mic: () => {
        if (!listenAgain()) void startTalk();
      },
      showChat: () => {
        endVoice();
        close();
        onShowChat();
      },
    }),
    [decide, undo, close, onShowChat],
  );

  return { state, levels, actions };
}
