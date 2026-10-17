import * as React from 'react';
import { AppState, BackHandler, Platform } from 'react-native';
import { act } from 'react-test-renderer';

import { flush, mount } from '@/testing/render';

import type {
  ClovieVoiceOutcomeEvent,
  ClovieVoiceStateEvent,
} from '../../clovieVoice';
import { useInAppVoice, type InAppVoice } from '../useInAppVoice';

type Listener<T> = (event: T) => void;
const listeners: {
  state?: Listener<ClovieVoiceStateEvent>;
  transcript?: Listener<{ text: string }>;
  outcome?: Listener<ClovieVoiceOutcomeEvent>;
} = {};
const mockOff = jest.fn();

const mockNative = {
  supports: true,
  answerApproval: jest.fn<boolean, [string, string]>(),
  undoAction: jest.fn<boolean, [string]>(),
  listenAgain: jest.fn<boolean, []>(),
  startTalk: jest.fn(),
  stopListening: jest.fn(),
  cancel: jest.fn(),
  endVoice: jest.fn(),
  setAppForeground: jest.fn(),
  setVoiceUiAttached: jest.fn(),
};

jest.mock('../../clovieVoice', () => ({
  supportsInAppVoice: () => mockNative.supports,
  addVoiceStateListener: (l: Listener<ClovieVoiceStateEvent>) => {
    listeners.state = l;
    return mockOff;
  },
  addVoiceTranscriptListener: (l: Listener<{ text: string }>) => {
    listeners.transcript = l;
    return mockOff;
  },
  addVoiceOutcomeListener: (l: Listener<ClovieVoiceOutcomeEvent>) => {
    listeners.outcome = l;
    return mockOff;
  },
  answerApproval: (...a: [string, string]) => mockNative.answerApproval(...a),
  undoAction: (id: string) => mockNative.undoAction(id),
  listenAgain: () => mockNative.listenAgain(),
  startTalk: (...a: unknown[]) => mockNative.startTalk(...a),
  stopListening: () => mockNative.stopListening(),
  cancel: () => mockNative.cancel(),
  endVoice: () => mockNative.endVoice(),
  setAppForeground: (v: boolean) => mockNative.setAppForeground(v),
  setVoiceUiAttached: (v: boolean) => mockNative.setVoiceUiAttached(v),
}));

const mockDecide = jest.fn();
const mockUndo = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    voiceDecideApproval: (...a: unknown[]) => mockDecide(...a),
    voiceUndoAction: (...a: unknown[]) => mockUndo(...a),
  },
  newIdempotencyKey: () => 'key-1',
}));

let voice!: InAppVoice;
function Probe({ onShowChat }: { onShowChat: () => void }) {
  voice = useInAppVoice({ onShowChat });
  return null;
}

const outcome = (over: Partial<ClovieVoiceOutcomeEvent> = {}) =>
  ({
    status: 'done',
    message: 'Shall I book it?',
    transcript: '',
    expectsReply: true,
    pendingApprovalId: 'oapr_A',
    pendingKind: 'create_appointment',
    pendingTitle: 'Book Gel Manicure for Thandi',
    pendingRemaining: 0,
    reason: '',
    ...over,
  }) satisfies ClovieVoiceOutcomeEvent;

function emit<T>(listener: Listener<T> | undefined, event: T) {
  act(() => listener?.(event));
}

let appStateHandler: ((s: string) => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.supports = true;
  mockNative.answerApproval.mockReturnValue(true);
  mockNative.listenAgain.mockReturnValue(true);
  Object.keys(listeners).forEach(
    (k) => delete listeners[k as keyof typeof listeners],
  );
  Platform.OS = 'android';
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _: string,
    handler: (s: string) => void,
  ) => {
    appStateHandler = handler;
    return { remove: jest.fn() };
  }) as never);
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    configurable: true,
  });
});

function mountProbe(onShowChat = jest.fn()) {
  mount(<Probe onShowChat={onShowChat} />);
  return onShowChat;
}

describe('useInAppVoice', () => {
  it('reports the foreground and attaches a drawer so the service skips the overlay', () => {
    mountProbe();
    expect(mockNative.setAppForeground).toHaveBeenCalledWith(true);
    expect(mockNative.setVoiceUiAttached).toHaveBeenCalledWith(true);
  });

  it('stays out of the way on a build without the in-app voice events', () => {
    mockNative.supports = false;
    mountProbe();
    expect(mockNative.setVoiceUiAttached).not.toHaveBeenCalled();
    expect(listeners.state).toBeUndefined();
    expect(voice.state.phase).toBe('closed');
  });

  it('detaches when it unmounts so the overlay is used again', () => {
    const tree = mount(<Probe onShowChat={jest.fn()} />);
    act(() => tree.unmount());
    expect(mockNative.setVoiceUiAttached).toHaveBeenLastCalledWith(false);
  });

  it('opens on listening, then thinking with the heard words, then the answer', () => {
    mountProbe();
    emit(listeners.state, { state: 'listening' });
    expect(voice.state.phase).toBe('listening');
    emit(listeners.transcript, { text: 'Book Thandi' });
    emit(listeners.state, { state: 'thinking' });
    expect(voice.state).toMatchObject({
      phase: 'thinking',
      transcript: 'Book Thandi',
    });
    emit(listeners.outcome, outcome());
    emit(listeners.state, { state: 'speaking' });
    expect(voice.state).toMatchObject({ phase: 'answer', isReading: true });
    expect(voice.state.approval?.id).toBe('oapr_A');
  });

  it('feeds levels to the waveform store, not to the drawer state', () => {
    mountProbe();
    emit(listeners.state, { state: 'listening' });
    const before = voice.state;
    emit(listeners.state, { state: 'listening', level: 0.7 });
    expect(voice.state).toBe(before);
    expect(voice.levels.getSnapshot().at(-1)).toBe(0.7);
  });

  it('closes when the interaction ends', () => {
    mountProbe();
    emit(listeners.state, { state: 'listening' });
    emit(listeners.state, { state: 'idle' });
    expect(voice.state.phase).toBe('closed');
  });

  it('sends Approve to the service bound to the approval shown', () => {
    mountProbe();
    emit(listeners.outcome, outcome());
    act(() => voice.actions.approve('oapr_A'));
    expect(mockNative.answerApproval).toHaveBeenCalledWith('oapr_A', 'yes');
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it('sends Decline to the service as a no on that id', () => {
    mountProbe();
    emit(listeners.outcome, outcome());
    act(() => voice.actions.decline('oapr_A'));
    expect(mockNative.answerApproval).toHaveBeenCalledWith('oapr_A', 'no');
  });

  it('decides by that same id through the API when the service has already ended', async () => {
    jest.useFakeTimers();
    mockNative.answerApproval.mockReturnValue(false);
    mockDecide.mockResolvedValue({ kind: 'create_appointment' });
    mountProbe();
    emit(listeners.outcome, outcome());
    await act(async () => {
      voice.actions.approve('oapr_A');
      await Promise.resolve();
    });
    expect(mockDecide).toHaveBeenCalledWith('oapr_A', 'approve', 'key-1');
    expect(voice.state.approval).toBeNull();
    expect(voice.state.reply).toBe('Done. Booked.');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(voice.state.phase).toBe('closed');
    jest.useRealTimers();
    await flush();
  });

  it('declines through the API as a decline, never an approve', async () => {
    mockNative.answerApproval.mockReturnValue(false);
    mockDecide.mockResolvedValue({ kind: null });
    mountProbe();
    emit(listeners.outcome, outcome());
    await act(async () => {
      voice.actions.decline('oapr_A');
      await Promise.resolve();
    });
    expect(mockDecide).toHaveBeenCalledWith('oapr_A', 'decline', 'key-1');
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });

  it('sends Undo to the service bound to the executed action shown', () => {
    mockNative.undoAction.mockReturnValue(true);
    mountProbe();
    emit(
      listeners.outcome,
      outcome({
        message: 'Done. Booked.',
        pendingApprovalId: '',
        pendingActionId: 'oact_1',
        undoUntilMs: Date.now() + 30_000,
      }),
    );
    expect(voice.state.action?.id).toBe('oact_1');
    act(() => voice.actions.undo('oact_1'));
    expect(mockNative.undoAction).toHaveBeenCalledWith('oact_1');
    expect(mockUndo).not.toHaveBeenCalled();
  });

  it('undoes that same id through the API when the service has already ended, and shows the result', async () => {
    jest.useFakeTimers();
    mockNative.undoAction.mockReturnValue(false);
    mockUndo.mockResolvedValue({ status: 'undone' });
    mountProbe();
    emit(
      listeners.outcome,
      outcome({
        pendingApprovalId: '',
        pendingActionId: 'oact_1',
        undoUntilMs: Date.now() + 30_000,
      }),
    );
    await act(async () => {
      voice.actions.undo('oact_1');
      await Promise.resolve();
    });
    expect(mockUndo).toHaveBeenCalledWith('oact_1', 'action:oact_1:undo');
    expect(voice.state.action).toBeNull();
    expect(voice.state.reply).toBe('Okay, undone.');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(voice.state.phase).toBe('closed');
    jest.useRealTimers();
    await flush();
  });

  it('says it is too late when the API refuses the undo', async () => {
    mockNative.undoAction.mockReturnValue(false);
    mockUndo.mockRejectedValue({
      code: 'RULE_VIOLATION',
      details: { reason: 'action.undo_window_closed' },
    });
    mountProbe();
    emit(
      listeners.outcome,
      outcome({
        pendingApprovalId: '',
        pendingActionId: 'oact_1',
        undoUntilMs: Date.now() + 30_000,
      }),
    );
    await act(async () => {
      voice.actions.undo('oact_1');
      await Promise.resolve();
    });
    expect(voice.state.reply).toBe('Too late to undo, the booking stands.');
  });

  it('listens again with the mic, and starts a fresh talk when no interaction is open', () => {
    mountProbe();
    act(() => voice.actions.mic());
    expect(mockNative.listenAgain).toHaveBeenCalled();
    expect(mockNative.startTalk).not.toHaveBeenCalled();
    mockNative.listenAgain.mockReturnValue(false);
    act(() => voice.actions.mic());
    expect(mockNative.startTalk).toHaveBeenCalledTimes(1);
  });

  it('forwards stop and cancel to the service', () => {
    mountProbe();
    act(() => {
      voice.actions.stop();
      voice.actions.cancel();
    });
    expect(mockNative.stopListening).toHaveBeenCalledTimes(1);
    expect(mockNative.cancel).toHaveBeenCalledTimes(1);
  });

  it('Show chat ends voice, closes the drawer and opens the chat', () => {
    const onShowChat = mountProbe();
    emit(listeners.state, { state: 'listening' });
    act(() => voice.actions.showChat());
    expect(mockNative.endVoice).toHaveBeenCalledTimes(1);
    expect(voice.state.phase).toBe('closed');
    expect(onShowChat).toHaveBeenCalledTimes(1);
  });

  it('ends voice when the app goes to the background with the drawer open', () => {
    mountProbe();
    emit(listeners.state, { state: 'listening' });
    act(() => appStateHandler?.('background'));
    expect(mockNative.setAppForeground).toHaveBeenLastCalledWith(false);
    expect(mockNative.endVoice).toHaveBeenCalledTimes(1);
    expect(voice.state.phase).toBe('closed');
  });

  it('does not end anything when the app backgrounds with voice closed', () => {
    mountProbe();
    act(() => appStateHandler?.('background'));
    expect(mockNative.endVoice).not.toHaveBeenCalled();
  });

  it('closes on the hardware back button while open', () => {
    let backHandler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _: string,
      handler: () => boolean,
    ) => {
      backHandler = handler;
      return { remove: jest.fn() };
    }) as never);
    mountProbe();
    emit(listeners.state, { state: 'listening' });
    let handled = false;
    act(() => {
      handled = backHandler?.() ?? false;
    });
    expect(handled).toBe(true);
    expect(mockNative.endVoice).toHaveBeenCalled();
    expect(voice.state.phase).toBe('closed');
  });
});
