import * as React from 'react';

import { act, mount, pressableByLabel, text } from '@/testing/render';

import { InAppVoiceDrawer } from '../InAppVoiceDrawer';
import {
  inAppVoiceReducer,
  drawerHeightFraction,
  INITIAL_VOICE_STATE,
  ANSWER_FRACTION,
  BASE_FRACTION,
  type InAppVoiceState,
} from '../inAppVoiceState';
import { createLevelStore } from '../levelStore';
import type { VoiceActions } from '../VoiceStates';

jest.mock('@/hooks/useMotionActive', () => ({ useMotionActive: () => false }));
jest.mock('@/features/brand/ClovieAnimated', () => ({
  ClovieAnimated: () => null,
}));

const T0 = Date.parse('2026-10-16T08:00:00Z');
const READ_BACK =
  "Done. Thandi Ngwenya, Gel Manicure, Saturday 17 October at 10:00. Say undo if that's wrong.";

const booked: InAppVoiceState = {
  ...INITIAL_VOICE_STATE,
  phase: 'answer',
  reply: READ_BACK,
  expectsReply: true,
  action: {
    id: 'oact_1',
    title: 'Booked Gel Manicure',
    lines: [
      { label: 'Client', from: null, to: 'Thandi Ngwenya' },
      { label: 'Service', from: null, to: 'Gel Manicure' },
      { label: 'When', from: 'Fri 16 Oct, 09:00', to: 'Sat 17 Oct, 10:00' },
    ],
    undoUntilMs: T0 + 30_000,
  },
};

function actions(): VoiceActions {
  return {
    stop: jest.fn(),
    cancel: jest.fn(),
    approve: jest.fn(),
    decline: jest.fn(),
    undo: jest.fn(),
    mic: jest.fn(),
    showChat: jest.fn(),
  };
}

function show(state: InAppVoiceState, now: () => number, a = actions()) {
  const tree = mount(
    <InAppVoiceDrawer
      state={state}
      levels={createLevelStore()}
      actions={a}
      now={now}
    />,
  );
  return { tree, a };
}

const byId = (tree: ReturnType<typeof mount>, id: string) =>
  tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('InAppVoiceDrawer: an executed action', () => {
  it('shows the read-back in large type, a raised Booked card with its lines, and Undo', () => {
    const { tree } = show(booked, () => T0);
    const copy = text(tree);
    expect(copy).toContain(READ_BACK);
    expect(byId(tree, 'voice-booked-card')).toHaveLength(1);
    expect(copy).toContain('Booked');
    expect(copy).toContain('Thandi Ngwenya');
    expect(copy).toContain('Gel Manicure');
    expect(copy).toContain('Fri 16 Oct, 09:00 to Sat 17 Oct, 10:00');
    expect(copy).toContain('Undo (30s)');
    expect(byId(tree, 'voice-approval-card')).toHaveLength(0);
  });

  it('makes Undo a 52 pt button that reports a press for that action id', () => {
    const { tree, a } = show(booked, () => T0);
    const button = pressableByLabel(tree, 'Undo this booking, 30 seconds left');
    const style = (
      Array.isArray(button.props.style)
        ? Object.assign({}, ...button.props.style.flat())
        : button.props.style
    ) as { height: number };
    expect(style.height).toBe(52);
    act(() => button.props.onPress());
    expect(a.undo).toHaveBeenCalledWith('oact_1');
  });

  it('counts down once a second while shown and removes Undo when the window ends', () => {
    let now = T0;
    const { tree } = show(booked, () => now);
    expect(text(tree)).toContain('Undo (30s)');

    now = T0 + 1_000;
    act(() => jest.advanceTimersByTime(1_000));
    expect(text(tree)).toContain('Undo (29s)');

    now = T0 + 29_000;
    act(() => jest.advanceTimersByTime(28_000));
    expect(text(tree)).toContain('Undo (1s)');

    now = T0 + 30_000;
    act(() => jest.advanceTimersByTime(1_000));
    expect(byId(tree, 'voice-undo')).toHaveLength(0);
    expect(text(tree)).not.toContain('Undo (');
    // The card stays as the record of what was booked.
    expect(byId(tree, 'voice-booked-card')).toHaveLength(1);
  });

  it('shows no Undo when the window has already closed, and runs no timer', () => {
    const { tree } = show(booked, () => T0 + 31_000);
    expect(byId(tree, 'voice-undo')).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops ticking once the window is over: nothing runs at rest', () => {
    let now = T0 + 29_000;
    show(booked, () => now);
    expect(jest.getTimerCount()).toBe(1);
    now = T0 + 30_000;
    act(() => jest.advanceTimersByTime(1_000));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops the timer when the drawer goes away', () => {
    const { tree } = show(booked, () => T0);
    expect(jest.getTimerCount()).toBe(1);
    act(() => tree.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('is taller, like the approval card', () => {
    expect(drawerHeightFraction(booked)).toBe(ANSWER_FRACTION);
    expect(drawerHeightFraction({ ...booked, action: null })).toBe(
      BASE_FRACTION,
    );
  });
});

describe('inAppVoiceReducer: executed action', () => {
  const event = {
    status: 'done' as const,
    message: READ_BACK,
    transcript: '',
    expectsReply: true,
    pendingApprovalId: '',
    pendingKind: '',
    pendingTitle: '',
    pendingRemaining: 0,
    pendingActionId: 'oact_1',
    undoUntilMs: T0 + 30_000,
    reason: '',
  };

  it('holds the action, with its lines when they are known', () => {
    const next = inAppVoiceReducer(INITIAL_VOICE_STATE, {
      type: 'outcome',
      event,
      action: {
        title: 'Booked Gel Manicure',
        lines: [{ label: 'Client', from: null, to: 'Thandi Ngwenya' }],
      },
    });
    expect(next.action).toEqual({
      id: 'oact_1',
      title: 'Booked Gel Manicure',
      lines: [{ label: 'Client', from: null, to: 'Thandi Ngwenya' }],
      undoUntilMs: T0 + 30_000,
    });
    expect(next.approval).toBeNull();
    expect(next.reply).toBe(READ_BACK);
  });

  it('still shows the card (no lines) when the lines are not known', () => {
    const next = inAppVoiceReducer(INITIAL_VOICE_STATE, {
      type: 'outcome',
      event,
    });
    expect(next.action).toMatchObject({ id: 'oact_1', lines: [] });
  });

  it('drops the action once the next outcome names none (the undo result)', () => {
    const held = inAppVoiceReducer(INITIAL_VOICE_STATE, {
      type: 'outcome',
      event,
    });
    const next = inAppVoiceReducer(held, {
      type: 'outcome',
      event: {
        ...event,
        message: 'Okay, undone.',
        expectsReply: false,
        pendingActionId: '',
        undoUntilMs: 0,
      },
    });
    expect(next.action).toBeNull();
    expect(next.reply).toBe('Okay, undone.');
  });

  it('ignores an action with no window', () => {
    const next = inAppVoiceReducer(INITIAL_VOICE_STATE, {
      type: 'outcome',
      event: { ...event, undoUntilMs: 0 },
    });
    expect(next.action).toBeNull();
  });

  it('keeps the action through a follow-up listen and clears it on close', () => {
    const held = inAppVoiceReducer(INITIAL_VOICE_STATE, {
      type: 'outcome',
      event,
    });
    const listening = inAppVoiceReducer(held, {
      type: 'state',
      event: { state: 'listening' },
    });
    expect(listening.action?.id).toBe('oact_1');
    expect(inAppVoiceReducer(listening, { type: 'close' }).action).toBeNull();
  });
});
