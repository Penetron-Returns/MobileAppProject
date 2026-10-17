import type {
  ClovieVoiceOutcomeEvent,
  ClovieVoiceStateEvent,
} from '../../clovieVoice';
import {
  ANSWER_FRACTION,
  BASE_FRACTION,
  INITIAL_VOICE_STATE,
  drawerHeightFraction,
  inAppVoiceReducer,
  outcomeToEvent,
  replyFromOutcome,
  type InAppVoiceAction,
  type InAppVoiceState,
} from '../inAppVoiceState';
import {
  BAR_COUNT,
  BAR_MAX,
  BAR_MIN,
  barHeight,
  createLevelStore,
} from '../levelStore';

const outcome = (
  over: Partial<ClovieVoiceOutcomeEvent> = {},
): ClovieVoiceOutcomeEvent => ({
  status: 'done',
  message: 'Thandi is free on Saturday at 10:00. Shall I book it?',
  transcript: '',
  expectsReply: true,
  pendingApprovalId: '',
  pendingKind: '',
  pendingTitle: '',
  pendingRemaining: 0,
  pendingActionId: '',
  undoUntilMs: 0,
  reason: '',
  ...over,
});

const approvalOutcome = outcome({
  pendingApprovalId: 'oapr_A',
  pendingKind: 'create_appointment',
  pendingTitle: 'Book Gel Manicure for Thandi Ngwenya',
});

const state = (event: ClovieVoiceStateEvent): InAppVoiceAction => ({
  type: 'state',
  event,
});

function run(
  actions: InAppVoiceAction[],
  from: InAppVoiceState = INITIAL_VOICE_STATE,
) {
  return actions.reduce(inAppVoiceReducer, from);
}

describe('inAppVoiceReducer', () => {
  it('opens in the listening state when the service starts listening', () => {
    const s = run([state({ state: 'listening' })]);
    expect(s).toMatchObject({ phase: 'listening', transcript: '' });
  });

  it('does not re-render the drawer for a microphone level tick', () => {
    const before = run([state({ state: 'listening' })]);
    expect(run([state({ state: 'listening', level: 0.4 })], before)).toBe(
      before,
    );
  });

  it('shows the heard words in the thinking state', () => {
    const s = run([
      state({ state: 'listening' }),
      { type: 'transcript', text: 'Book Thandi for Saturday at ten' },
      state({ state: 'thinking' }),
    ]);
    expect(s).toMatchObject({
      phase: 'thinking',
      transcript: 'Book Thandi for Saturday at ten',
    });
  });

  it('ignores words that arrive while closed', () => {
    expect(run([{ type: 'transcript', text: 'hello' }])).toBe(
      INITIAL_VOICE_STATE,
    );
  });

  it('shows the reply, reading aloud and the approval card for a booking', () => {
    const s = run([
      state({ state: 'thinking' }),
      { type: 'outcome', event: approvalOutcome },
      state({ state: 'speaking' }),
    ]);
    expect(s).toMatchObject({
      phase: 'answer',
      reply: 'Thandi is free on Saturday at 10:00. Shall I book it?',
      replyKind: 'text',
      isReading: true,
      expectsReply: true,
      approval: {
        id: 'oapr_A',
        kind: 'create_appointment',
        title: 'Book Gel Manicure for Thandi Ngwenya',
      },
    });
  });

  it('accepts the speaking state before the outcome as well', () => {
    const s = run([
      state({ state: 'speaking' }),
      { type: 'outcome', event: approvalOutcome },
    ]);
    expect(s).toMatchObject({ phase: 'answer', isReading: true });
    expect(s.approval?.id).toBe('oapr_A');
  });

  it('keeps the card on screen while the service listens for the yes or no', () => {
    const answered = run([
      { type: 'outcome', event: approvalOutcome },
      state({ state: 'speaking' }),
      state({ state: 'listening' }),
    ]);
    expect(answered).toMatchObject({
      phase: 'answer',
      isListening: true,
      isReading: false,
    });
    expect(answered.approval?.id).toBe('oapr_A');
  });

  it('holds the card when the service waits with the microphone closed', () => {
    const s = run([
      { type: 'outcome', event: approvalOutcome },
      state({ state: 'speaking' }),
      state({ state: 'listening' }),
      state({ state: 'waiting' }),
    ]);
    expect(s).toMatchObject({
      phase: 'answer',
      isListening: false,
      isReading: false,
    });
    expect(s.approval?.id).toBe('oapr_A');
  });

  it('binds the card to the newest approval when the next one is read', () => {
    const next = outcome({ ...approvalOutcome, pendingApprovalId: 'oapr_B' });
    const s = run([
      { type: 'outcome', event: approvalOutcome },
      { type: 'outcome', event: next },
    ]);
    expect(s.approval?.id).toBe('oapr_B');
  });

  it('drops the card once an outcome names no approval', () => {
    const s = run([
      { type: 'outcome', event: approvalOutcome },
      {
        type: 'outcome',
        event: outcome({ message: 'Done. Booked.', expectsReply: false }),
      },
    ]);
    expect(s.approval).toBeNull();
    expect(s.reply).toBe('Done. Booked.');
  });

  it('closes and forgets everything when the interaction ends', () => {
    const s = run([
      { type: 'outcome', event: approvalOutcome },
      state({ state: 'idle' }),
    ]);
    expect(s).toBe(INITIAL_VOICE_STATE);
  });

  it('goes back to listening when a thinking request is cancelled', () => {
    const s = run([
      state({ state: 'listening' }),
      { type: 'transcript', text: 'book Thandi' },
      state({ state: 'thinking' }),
      { type: 'transcript', text: '' },
      state({ state: 'listening' }),
    ]);
    expect(s).toMatchObject({ phase: 'listening', transcript: '' });
  });

  it('closes on a local close action', () => {
    expect(run([{ type: 'close' }], run([state({ state: 'listening' })]))).toBe(
      INITIAL_VOICE_STATE,
    );
  });
});

describe('replyFromOutcome', () => {
  it.each([
    [
      'a normal reply',
      outcome({ message: 'You have 3 bookings.' }),
      { reply: 'You have 3 bookings.', replyKind: 'text' },
    ],
    [
      'nothing heard',
      outcome({ status: 'error', message: "Didn't catch that" }),
      { reply: '', replyKind: 'notHeard' },
    ],
    [
      'an empty message',
      outcome({ status: 'error', message: '' }),
      { reply: '', replyKind: 'notHeard' },
    ],
    [
      'speech missing on the phone',
      outcome({ status: 'error', message: 'speech_unavailable' }),
      { reply: '', replyKind: 'speechUnavailable' },
    ],
    [
      'the app has to finish it',
      outcome({ status: 'open_app', message: '' }),
      { reply: '', replyKind: 'couldNot' },
    ],
  ])('maps %s', (_name, event, expected) => {
    expect(replyFromOutcome(event)).toEqual(expected);
  });
});

describe('outcomeToEvent', () => {
  it('fills the fields an outcome decided in JS leaves out', () => {
    expect(
      outcomeToEvent({ status: 'done', message: 'Done. Booked.' }),
    ).toEqual(
      outcome({
        message: 'Done. Booked.',
        expectsReply: false,
      }),
    );
  });
});

describe('drawerHeightFraction', () => {
  it('is 62% for listening and thinking and taller for an approval answer', () => {
    expect(BASE_FRACTION).toBeCloseTo(0.62, 2);
    expect(drawerHeightFraction(run([state({ state: 'listening' })]))).toBe(
      BASE_FRACTION,
    );
    expect(
      drawerHeightFraction(run([{ type: 'outcome', event: approvalOutcome }])),
    ).toBe(ANSWER_FRACTION);
    expect(
      drawerHeightFraction(run([{ type: 'outcome', event: outcome() }])),
    ).toBe(BASE_FRACTION);
  });
});

describe('level store and bars', () => {
  it('keeps the newest level on the right and drops the oldest', () => {
    const store = createLevelStore();
    store.push(0.2);
    store.push(0.9);
    const levels = store.getSnapshot();
    expect(levels).toHaveLength(BAR_COUNT);
    expect(levels.at(-1)).toBe(0.9);
    expect(levels.at(-2)).toBe(0.2);
    expect(levels[0]).toBe(0);
  });

  it('clamps nonsense levels and notifies subscribers once per change', () => {
    const store = createLevelStore();
    const listener = jest.fn();
    const off = store.subscribe(listener);
    store.push(7);
    store.push(Number.NaN);
    expect(store.getSnapshot().at(-2)).toBe(1);
    expect(store.getSnapshot().at(-1)).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    store.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('hands out a new snapshot array on every change', () => {
    const store = createLevelStore();
    const before = store.getSnapshot();
    store.push(0.5);
    expect(store.getSnapshot()).not.toBe(before);
  });

  it('draws the board silhouette: low at the edges, tall in the middle, never under 8 or over 46', () => {
    const heights = Array.from({ length: BAR_COUNT }, (_, i) =>
      barHeight(i, null),
    );
    expect(Math.max(...heights)).toBeLessThanOrEqual(BAR_MAX);
    expect(Math.min(...heights)).toBe(BAR_MIN);
    expect(heights[14]).toBeGreaterThan(heights[0]!);
    expect(barHeight(14, 0)).toBe(BAR_MIN);
    expect(barHeight(14, 1)).toBeGreaterThan(barHeight(14, 0.1));
  });
});
