import { askCompanion, type AskDeps, type AskResult } from '../ask';
import { runVoiceCommandHeadless, type HeadlessDeps } from '../headless';
import type { ExecutedAction } from '../undo';

const TEXT: Record<string, string> = {
  'voice.undo.done': 'Okay, undone.',
  'voice.undo.tooLate': 'Too late to undo, the booking stands.',
  'voice.undo.failed': "I couldn't undo that, the booking stands.",
  'voice.ask.noReply': 'No answer.',
};
const t = (key: string) => TEXT[key] ?? key;
const NOW = new Date('2026-10-16T08:00:00Z');

const READ_BACK =
  "Done. Thandi Ngwenya, Gel Manicure, Saturday 17 October at 10:00. Say undo if that's wrong.";

function executed(over: Partial<ExecutedAction> = {}): ExecutedAction {
  return {
    id: 'oact_1',
    status: 'executed',
    title: 'Booked',
    readBack: READ_BACK,
    lines: [],
    undoUntil: '2026-10-16T08:00:30Z',
    undoable: true,
    ...over,
  };
}

function deps(result: AskResult): AskDeps & { ask: jest.Mock } {
  return {
    t,
    now: () => NOW,
    ask: jest.fn(async () => result),
    decide: jest.fn(async () => ({ kind: null })),
    rememberAction: jest.fn(),
  };
}

describe('askCompanion with an executed action', () => {
  it('speaks the read-back, keeps the undo window and remembers the action', async () => {
    const d = deps({
      reply: 'I booked Thandi in.',
      approvals: [],
      actions: [executed()],
    });
    const out = await askCompanion('book Thandi', d);
    expect(out).toMatchObject({
      status: 'done',
      spoken: READ_BACK,
      expectsReply: true,
      pendingActionId: 'oact_1',
      undoUntilMs: NOW.getTime() + 30_000,
    });
    expect(d.rememberAction).toHaveBeenCalledWith(executed());
  });

  it('keeps the window even though the companion did not await a reply, and holds no approval', async () => {
    const out = await askCompanion(
      'book Thandi',
      deps({
        reply: 'Booked.',
        approvals: [],
        actions: [executed()],
        awaitingReply: false,
      }),
    );
    expect(out.pendingApprovalId).toBeUndefined();
    expect(out.pendingActionId).toBe('oact_1');
  });

  it('a reply with no action behaves as before', async () => {
    const out = await askCompanion(
      'hi',
      deps({ reply: 'You have two bookings.', approvals: [] }),
    );
    expect(out.pendingActionId).toBeUndefined();
    expect(out.expectsReply).toBeUndefined();
  });
});

function headless(
  result: AskResult = { reply: 'You have two.', approvals: [] },
) {
  const base = deps(result);
  return {
    ...base,
    now: () => NOW,
    undo: jest.fn(async () => ({})),
    isSignedIn: async () => true,
    loadToday: async () => ({
      appointments: [],
      timezone: 'Africa/Johannesburg',
    }),
    checkIn: jest.fn(async () => ({})),
  } satisfies HeadlessDeps & { ask: jest.Mock; undo: jest.Mock };
}

const WINDOW = {
  pendingActionId: 'oact_1',
  undoUntilMs: NOW.getTime() + 30_000,
};

describe('the passive undo window in a follow-up turn', () => {
  it('undoes the action just read when the owner says undo, and says so', async () => {
    const d = headless();
    const out = await runVoiceCommandHeadless('undo that', d, WINDOW);
    expect(d.undo).toHaveBeenCalledWith('oact_1');
    expect(d.ask).not.toHaveBeenCalled();
    expect(out).toMatchObject({ status: 'done', spoken: 'Okay, undone.' });
    expect(out.pendingActionId).toBeUndefined();
  });

  it.each(['no', 'stop', 'No.'])(
    'a bare %j does not undo: it goes to the companion as normal',
    async (said) => {
      const d = headless();
      await runVoiceCommandHeadless(said, d, WINDOW);
      expect(d.undo).not.toHaveBeenCalled();
      expect(d.ask).toHaveBeenCalledTimes(1);
    },
  );

  it('anything else goes to the companion as a normal request', async () => {
    const d = headless();
    await runVoiceCommandHeadless('what is on tomorrow', d, WINDOW);
    expect(d.undo).not.toHaveBeenCalled();
    expect(d.ask).toHaveBeenCalledWith('what is on tomorrow');
  });

  it('an undo phrase with no window pending is just a request: nothing is undone', async () => {
    const d = headless();
    await runVoiceCommandHeadless('undo that', d, {});
    expect(d.undo).not.toHaveBeenCalled();
  });

  it('never undoes any id but the one carried from the last read-back', async () => {
    const d = headless();
    await runVoiceCommandHeadless('undo', d, {
      pendingActionId: 'oact_LAST',
      undoUntilMs: NOW.getTime() + 5_000,
    });
    expect(d.undo).toHaveBeenCalledTimes(1);
    expect(d.undo).toHaveBeenCalledWith('oact_LAST');
  });

  it('says it is too late when the window has closed on the server', async () => {
    const d = headless();
    d.undo.mockRejectedValueOnce({
      code: 'RULE_VIOLATION',
      details: { reason: 'action.undo_window_closed' },
    });
    const out = await runVoiceCommandHeadless('undo that', d, WINDOW);
    expect(out).toEqual({
      status: 'error',
      message: 'Too late to undo, the booking stands.',
    });
  });

  it('asks to open the app when there is no session', async () => {
    const d = { ...headless(), isSignedIn: async () => false };
    const out = await runVoiceCommandHeadless('undo that', d, WINDOW);
    expect(out.status).toBe('open_app');
    expect(d.undo).not.toHaveBeenCalled();
  });

  it('a new booking in the same turn carries its own id and window, not the old one', async () => {
    const d = headless({
      reply: 'Booked.',
      approvals: [],
      actions: [executed({ id: 'oact_2', undoUntil: '2026-10-16T08:00:20Z' })],
    });
    const out = await runVoiceCommandHeadless('book Sipho at 11', d, WINDOW);
    expect(out.pendingActionId).toBe('oact_2');
    expect(out.undoUntilMs).toBe(NOW.getTime() + 20_000);
  });
});
