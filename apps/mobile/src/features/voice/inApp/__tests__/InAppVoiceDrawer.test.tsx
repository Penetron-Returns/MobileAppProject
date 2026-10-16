import * as React from 'react';
import { StyleSheet } from 'react-native';

import { mount, pressableByLabel, text } from '@/testing/render';

import { InAppVoiceDrawer } from '../InAppVoiceDrawer';
import { INITIAL_VOICE_STATE, type InAppVoiceState } from '../inAppVoiceState';
import { BAR_COUNT, createLevelStore } from '../levelStore';
import type { VoiceActions } from '../VoiceStates';

let mockMotion = true;
jest.mock('@/hooks/useMotionActive', () => ({
  useMotionActive: () => mockMotion,
}));

// The real Clovie is a WebView; the drawer only chooses its state.
const mockClovie: string[] = [];
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: ({ state, size }: { state?: string; size: number }) => {
    mockClovie.push(`${state ?? 'default'}:${size}`);
    return null;
  },
}));

const actions = (): VoiceActions => ({
  stop: jest.fn(),
  cancel: jest.fn(),
  approve: jest.fn(),
  decline: jest.fn(),
  mic: jest.fn(),
  showChat: jest.fn(),
});

const listening: InAppVoiceState = {
  ...INITIAL_VOICE_STATE,
  phase: 'listening',
};
const thinking: InAppVoiceState = {
  ...INITIAL_VOICE_STATE,
  phase: 'thinking',
  transcript: 'Book Thandi Ngwenya in for a gel manicure on Saturday at ten',
};
const answer: InAppVoiceState = {
  ...INITIAL_VOICE_STATE,
  phase: 'answer',
  reply: 'Thandi is free on Saturday at 10:00. Shall I book it?',
  isReading: true,
  expectsReply: true,
  approval: {
    id: 'oapr_A',
    kind: 'create_appointment',
    title: 'Book Gel Manicure for Thandi Ngwenya, Sat 17 Oct, 10:00-11:00?',
  },
};

function show(state: InAppVoiceState, a = actions()) {
  const levels = createLevelStore();
  const tree = mount(
    <InAppVoiceDrawer state={state} levels={levels} actions={a} />,
  );
  return { tree, a, levels };
}

const byId = (tree: ReturnType<typeof mount>, id: string) =>
  tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

beforeEach(() => {
  mockMotion = true;
  mockClovie.length = 0;
});

describe('InAppVoiceDrawer: listening', () => {
  it('shows Clovie, Listening, the live words, the waveform and one stop control', () => {
    const { tree } = show({ ...listening, transcript: 'Book Thandi' });
    const copy = text(tree);
    expect(copy).toContain('Listening…');
    expect(copy).toContain('Book Thandi');
    expect(copy).toContain('Tap to stop');
    expect(copy).toContain('Show chat');
    expect(byId(tree, 'voice-bar')).toHaveLength(BAR_COUNT);
    expect(mockClovie).toContain('default:76');
    expect(pressableByLabel(tree, 'Stop listening')).toBeTruthy();
  });

  it('draws the drawer at about 62% of the screen', () => {
    const { tree } = show(listening);
    const [drawer] = byId(tree, 'voice-drawer');
    const { height } = StyleSheet.flatten(drawer!.props.style) as {
      height: number;
    };
    // The test window is 750 x 1334 (RN default); the board is 540 / 874.
    expect(height / 1334).toBeCloseTo(540 / 874, 2);
  });

  it('makes the stop button a 72 pt control', () => {
    const { tree } = show(listening);
    const stop = pressableByLabel(tree, 'Stop listening');
    const style = StyleSheet.flatten(stop.props.style) as {
      width: number;
      height: number;
    };
    expect([style.width, style.height]).toEqual([72, 72]);
  });

  it('calls stop, and show chat, on their buttons', () => {
    const { tree, a } = show(listening);
    pressableByLabel(tree, 'Stop listening').props.onPress();
    pressableByLabel(tree, 'Show chat').props.onPress();
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(a.showChat).toHaveBeenCalledTimes(1);
  });
});

describe('InAppVoiceDrawer: thinking', () => {
  it('shows the heard words in a chip, the status line, the orb and a 72 pt cancel', () => {
    const { tree, a } = show(thinking);
    const copy = text(tree);
    expect(copy).toContain(thinking.transcript);
    expect(copy).toContain('One sec, checking…');
    expect(byId(tree, 'voice-orb')).toHaveLength(1);
    expect(mockClovie).toContain('working:76');
    const cancel = pressableByLabel(tree, 'Cancel');
    const style = StyleSheet.flatten(cancel.props.style) as { width: number };
    expect(style.width).toBe(72);
    cancel.props.onPress();
    expect(a.cancel).toHaveBeenCalledTimes(1);
  });

  it('labels the chip for a screen reader', () => {
    const { tree } = show(thinking);
    expect(
      tree.root.findAll(
        (n) =>
          n.props.accessibilityLabel === `You said: ${thinking.transcript}`,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('draws the travelling beam only while thinking', () => {
    expect(byId(show(thinking).tree, 'voice-beam')).toHaveLength(1);
    expect(byId(show(listening).tree, 'voice-beam')).toHaveLength(0);
  });
});

describe('InAppVoiceDrawer: answer', () => {
  it('shows Reading aloud, the reply, the approval card and the yes or no hint', () => {
    const { tree } = show(answer);
    const copy = text(tree);
    expect(copy).toContain('Reading aloud');
    expect(copy).toContain(answer.reply);
    expect(copy).toContain(answer.approval!.title);
    expect(copy).toContain('or just say yes or no');
    expect(mockClovie).toContain('default:60');
    expect(pressableByLabel(tree, 'Approve')).toBeTruthy();
    expect(pressableByLabel(tree, 'Decline')).toBeTruthy();
  });

  it('draws the taller drawer for the approval card', () => {
    const { tree } = show(answer);
    const [drawer] = byId(tree, 'voice-drawer');
    const { height } = StyleSheet.flatten(drawer!.props.style) as {
      height: number;
    };
    expect(height / 1334).toBeCloseTo(650 / 874, 2);
  });

  it('hides Reading aloud once the reply has been spoken', () => {
    const { tree } = show({ ...answer, isReading: false });
    expect(text(tree)).not.toContain('Reading aloud');
  });

  it('makes Approve and Decline 52 pt buttons', () => {
    const { tree } = show(answer);
    for (const label of ['Approve', 'Decline']) {
      const style = StyleSheet.flatten(
        pressableByLabel(tree, label).props.style,
      ) as { height: number };
      expect(style.height).toBe(52);
    }
  });

  it('binds Approve and Decline to the approval being shown', () => {
    const { tree, a } = show(answer);
    pressableByLabel(tree, 'Approve').props.onPress();
    pressableByLabel(tree, 'Decline').props.onPress();
    expect(a.approve).toHaveBeenCalledWith('oapr_A');
    expect(a.decline).toHaveBeenCalledWith('oapr_A');
  });

  it('binds to the next approval when the card changes', () => {
    const a = actions();
    const next = {
      ...answer,
      approval: { id: 'oapr_B', kind: 'cancel_appointment', title: 'Cancel?' },
    };
    const { tree } = show(next, a);
    pressableByLabel(tree, 'Approve').props.onPress();
    expect(a.approve).toHaveBeenCalledWith('oapr_B');
  });

  it('continues by voice with the 56 pt mic', () => {
    const { tree, a } = show(answer);
    const mic = pressableByLabel(tree, 'Speak to Clovie');
    expect(
      (StyleSheet.flatten(mic.props.style) as { width: number }).width,
    ).toBe(56);
    mic.props.onPress();
    expect(a.mic).toHaveBeenCalledTimes(1);
  });

  it('shows a plain reply with no card and no mic when nothing is awaited', () => {
    const { tree } = show({
      ...INITIAL_VOICE_STATE,
      phase: 'answer',
      reply: 'You have 3 bookings today.',
    });
    expect(text(tree)).toContain('You have 3 bookings today.');
    expect(byId(tree, 'voice-approval-card')).toHaveLength(0);
    expect(
      tree.root.findAll(
        (n) => n.props.accessibilityLabel === 'Speak to Clovie',
      ),
    ).toHaveLength(0);
  });

  it('says so, with a retry mic, when nothing was heard', () => {
    const { tree } = show({
      ...INITIAL_VOICE_STATE,
      phase: 'answer',
      replyKind: 'notHeard',
    });
    expect(text(tree)).toContain("I didn't catch that");
    expect(pressableByLabel(tree, 'Speak to Clovie')).toBeTruthy();
  });
});

describe('InAppVoiceDrawer: closed', () => {
  it('draws nothing', () => {
    const { tree } = show(INITIAL_VOICE_STATE);
    expect(byId(tree, 'voice-drawer')).toHaveLength(0);
  });
});

describe('InAppVoiceDrawer: Reduce Motion and visibility', () => {
  it('holds the waveform at the board shape and draws no rings or live caret blink', () => {
    mockMotion = false;
    const { tree, levels } = show(listening);
    const before = byId(tree, 'voice-bar').map(
      (n) => (StyleSheet.flatten(n.props.style) as { height: number }).height,
    );
    expect(byId(tree, 'voice-ring')).toHaveLength(0);
    // Levels are not read at all while not live.
    expect(Math.max(...before)).toBeGreaterThan(8);
    levels.push(1);
    const after = byId(tree, 'voice-bar').map(
      (n) => (StyleSheet.flatten(n.props.style) as { height: number }).height,
    );
    expect(after).toEqual(before);
  });

  it('keeps the caret solid and draws no ring on the mic while not live', () => {
    mockMotion = false;
    const answering = show({ ...answer, isListening: true }).tree;
    expect(byId(answering, 'voice-ring')).toHaveLength(0);
    const caret = byId(show(listening).tree, 'voice-caret')[0]!;
    expect(
      (StyleSheet.flatten(caret.props.style) as { opacity: number }).opacity,
    ).toBe(1);
  });

  it('draws the rings behind the stop button while live', () => {
    mockMotion = true;
    expect(byId(show(listening).tree, 'voice-ring')).toHaveLength(2);
  });

  it('rings the mic only while the microphone is open', () => {
    mockMotion = true;
    const waiting = byId(
      show({ ...answer, isListening: false }).tree,
      'voice-ring',
    );
    const open = byId(
      show({ ...answer, isListening: true }).tree,
      'voice-ring',
    );
    expect(waiting).toHaveLength(0);
    expect(open).toHaveLength(2);
  });

  it('moves the waveform with the level while live', () => {
    mockMotion = true;
    const { tree, levels } = show(listening);
    const heights = () =>
      byId(tree, 'voice-bar').map(
        (n) => (StyleSheet.flatten(n.props.style) as { height: number }).height,
      );
    const quiet = heights();
    const { act } = require('react-test-renderer');
    act(() => {
      for (let i = 0; i < BAR_COUNT; i++) levels.push(0.8);
    });
    expect(heights()).not.toEqual(quiet);
    expect(Math.max(...heights())).toBeGreaterThan(Math.max(...quiet));
  });
});
