import {
  actionOutcome,
  isUndoPhrase,
  isUndoWindowOpen,
  parseUndoUntil,
  pickExecutedAction,
  plainReadBack,
  undoPendingAction,
  undoSecondsLeft,
  type ExecutedAction,
} from '../undo';

const TEXT: Record<string, string> = {
  'voice.undo.done': 'Okay, undone.',
  'voice.undo.tooLate': 'Too late to undo, the booking stands.',
  'voice.undo.failed': "I couldn't undo that, the booking stands.",
};
const t = (key: string) => TEXT[key] ?? key;

const NOW = Date.parse('2026-10-16T08:00:00Z');

function action(over: Partial<ExecutedAction> = {}): ExecutedAction {
  return {
    id: 'oact_1',
    status: 'executed',
    title: 'Booked Gel Manicure',
    readBack:
      "Done. Thandi Ngwenya, Gel Manicure, Saturday 17 October at 10:00. Say undo if that's wrong.",
    lines: [{ label: 'Client', from: null, to: 'Thandi Ngwenya' }],
    undoUntil: '2026-10-16T08:00:30Z',
    undoable: true,
    ...over,
  };
}

describe('isUndoPhrase', () => {
  it.each([
    'undo',
    'Undo.',
    'undo that',
    'Undo that please',
    'can you undo that',
    'cancel that',
    'no wait',
    'No, wait!',
    'scratch that',
    'take that back',
    "that's wrong",
    'Thats wrong',
    'That’s wrong',
    "that's not right",
    'hey Clovie undo that',
    'sorry, scratch that',
  ])('%j undoes', (text) => {
    expect(isUndoPhrase(text)).toBe(true);
  });

  it.each([
    'no',
    'No.',
    'stop',
    'nope',
    'yes',
    'wait',
    'cancel',
    '',
    '   ',
    "don't undo that",
    'do not undo it',
    'book Sipho for a haircut tomorrow at ten and then undo the last one for Thandi',
    'move Thandi to Friday',
    'what is wrong with Saturday',
  ])('%j does not', (text) => {
    expect(isUndoPhrase(text)).toBe(false);
  });
});

describe('the undo window', () => {
  it('parses undoUntil and rejects junk', () => {
    expect(parseUndoUntil('2026-10-16T08:00:30Z')).toBe(NOW + 30_000);
    expect(parseUndoUntil(null)).toBeNull();
    expect(parseUndoUntil('')).toBeNull();
    expect(parseUndoUntil('soon')).toBeNull();
  });

  it.each([
    [NOW + 1, true],
    [NOW + 30_000, true],
    [NOW, false],
    [NOW - 1, false],
    [null, false],
    [undefined, false],
  ])('is open until %j: %j', (until, expected) => {
    expect(isUndoWindowOpen(until, NOW)).toBe(expected);
  });

  it.each([
    [NOW + 30_000, 30],
    [NOW + 29_001, 30],
    [NOW + 1_000, 1],
    [NOW + 1, 1],
    [NOW, 0],
    [NOW - 5_000, 0],
  ])('counts %j as %j seconds left', (until, seconds) => {
    expect(undoSecondsLeft(until, NOW)).toBe(seconds);
  });
});

describe('actionOutcome', () => {
  it('reads the read-back plainly and keeps a passive undo window for that action', () => {
    expect(
      actionOutcome(
        action({
          readBack: "**Done.** Thandi, `Gel`. Say undo if that's wrong.",
        }),
        NOW,
      ),
    ).toEqual({
      status: 'done',
      message: "Done. Thandi, Gel. Say undo if that's wrong.",
      spoken: "Done. Thandi, Gel. Say undo if that's wrong.",
      expectsReply: true,
      pendingActionId: 'oact_1',
      undoUntilMs: NOW + 30_000,
    });
  });

  it('falls back to the title when there is no read-back', () => {
    expect(actionOutcome(action({ readBack: '' }), NOW).message).toBe(
      'Booked Gel Manicure',
    );
  });

  it.each([
    ['no window', null],
    ['a closed window', '2026-10-16T07:59:00Z'],
  ])('speaks it but listens for nothing with %s', (_name, undoUntil) => {
    const out = actionOutcome(action({ undoUntil }), NOW);
    expect(out.spoken).toContain('Done.');
    expect(out.expectsReply).toBeUndefined();
    expect(out.pendingActionId).toBeUndefined();
  });
});

describe('pickExecutedAction', () => {
  it('takes the first executed, undoable action', () => {
    const undone = action({ id: 'a', status: 'undone' });
    const locked = action({ id: 'b', undoable: false });
    const good = action({ id: 'c' });
    expect(pickExecutedAction([undone, locked, good])?.id).toBe('c');
    expect(pickExecutedAction([undone, locked])).toBeUndefined();
    expect(pickExecutedAction(undefined)).toBeUndefined();
  });
});

describe('plainReadBack', () => {
  it('drops markdown and tidies spaces', () => {
    expect(plainReadBack('  **Done.**  _Thandi_\n at 10:00 ')).toBe(
      'Done. Thandi at 10:00',
    );
  });
});

describe('undoPendingAction', () => {
  it('undoes exactly the id it was given and says so', async () => {
    const undo = jest.fn(async () => ({}));
    await expect(undoPendingAction('oact_1', { t, undo })).resolves.toEqual({
      status: 'done',
      message: 'Okay, undone.',
      spoken: 'Okay, undone.',
    });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(undo).toHaveBeenCalledWith('oact_1');
  });

  it.each([
    ['action.undo_window_closed', 'Too late to undo, the booking stands.'],
    ['action.not_undoable', 'Too late to undo, the booking stands.'],
    ['action.undo_failed', "I couldn't undo that, the booking stands."],
  ])('says the right thing for %s', async (reason, message) => {
    const undo = jest.fn().mockRejectedValue({
      code: 'RULE_VIOLATION',
      details: { reason },
    });
    await expect(undoPendingAction('oact_1', { t, undo })).resolves.toEqual({
      status: 'error',
      message,
    });
  });

  it.each(['NOT_FOUND', 'NETWORK_ERROR', 'UPSTREAM_ERROR', 'RATE_LIMITED'])(
    'says it could not undo on %s',
    async (code) => {
      const undo = jest.fn().mockRejectedValue({ code });
      await expect(undoPendingAction('oact_1', { t, undo })).resolves.toEqual({
        status: 'error',
        message: "I couldn't undo that, the booking stands.",
      });
    },
  );

  it('asks the owner to open the app when there is no session', async () => {
    const undo = jest.fn().mockRejectedValue({ code: 'NOT_SIGNED_IN' });
    await expect(undoPendingAction('oact_1', { t, undo })).resolves.toEqual({
      status: 'open_app',
      message: '',
    });
  });
});
