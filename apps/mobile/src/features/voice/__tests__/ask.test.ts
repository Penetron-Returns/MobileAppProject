import {
  answerPendingApproval,
  askCompanion,
  classifyReply,
  doneMessage,
  parsePendingQueue,
  replyExpectsAnswer,
  speakableApproval,
  trimForSpeech,
  type AskDeps,
  type AskResult,
} from '../ask';
import { runVoiceCommandHeadless, type HeadlessDeps } from '../headless';

const TEXT: Record<string, string> = {
  'voice.ask.sayYesOrNo': 'Say yes or no.',
  'voice.ask.several': 'I have {{count}} changes to confirm, one at a time.',
  'voice.ask.next': 'Next.',
  'voice.ask.noReply': 'No answer.',
  'voice.ask.failed': 'Could not reach Clovie.',
  'voice.ask.declined': "Okay, I won't.",
  'voice.ask.expired': 'Expired.',
  'voice.ask.done.booked': 'Done. Booked.',
  'voice.ask.done.moved': 'Done. Moved.',
  'voice.ask.done.cancelled': 'Done. Cancelled.',
  'voice.ask.done.generic': 'Done.',
  'voice.noCompanion': 'No companion in plan.',
};
const t = (key: string, values?: Record<string, unknown>) =>
  (TEXT[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) =>
    String(values?.[k] ?? ''),
  );

const A = {
  id: 'oapr_A',
  kind: 'create_appointment',
  title: 'Book Gel overlay for Thandi Ngwenya on Fri 16 Oct, 20:30-21:15?',
};
const B = {
  id: 'oapr_B',
  kind: 'cancel_appointment',
  title: 'Cancel Cut for Sipho Dlamini on Sat 17 Oct, 09:00-09:45?',
};

function deps(result: AskResult = { reply: '', approvals: [] }): AskDeps & {
  ask: jest.Mock;
  decide: jest.Mock;
} {
  return {
    t,
    ask: jest.fn(async () => result),
    decide: jest.fn(async () => ({ kind: null })),
  };
}

describe('classifyReply', () => {
  it.each([
    'yes',
    'Yes!',
    'yeah',
    'yep',
    'sure',
    'ok',
    'okay',
    'confirm',
    'do it',
    'go ahead',
    'please',
    'yes please',
    'Okay, go ahead.',
  ])('%s is yes', (text) => expect(classifyReply(text)).toBe('yes'));

  it.each([
    'no',
    'nope',
    'cancel',
    "don't",
    'dont',
    'do not',
    'stop',
    'never mind',
    'no thanks',
    'Nope, never mind.',
  ])('%s is no', (text) => expect(classifyReply(text)).toBe('no'));

  it.each([
    '',
    'make it half past nine',
    'yes but make it five',
    'cancel my three o clock',
    'yes no',
    'what time is that',
    'move it to Friday',
  ])('%j is other', (text) => expect(classifyReply(text)).toBe('other'));
});

describe('speakableApproval', () => {
  it('keeps the client, service, date and time, only making them speakable', () => {
    expect(speakableApproval(A.title)).toBe(
      'Book Gel overlay for Thandi Ngwenya on Friday 16 October at 20:30 to 21:15?',
    );
  });

  it('keeps the date for a move', () => {
    expect(speakableApproval('Move Gel overlay to Fri 10 Oct, 10:00?')).toBe(
      'Move Gel overlay to Friday 10 October at 10:00?',
    );
  });

  it('expands every weekday and month abbreviation', () => {
    expect(speakableApproval('Cancel Cut on Tue 1 Sep, 08:00-08:30?')).toBe(
      'Cancel Cut on Tuesday 1 September at 08:00 to 08:30?',
    );
    expect(speakableApproval('Cancel Cut on Sun 3 May, 08:00?')).toBe(
      'Cancel Cut on Sunday 3 May at 08:00?',
    );
  });

  it('handles an en dash range and a date with no weekday', () => {
    expect(speakableApproval('Book Cut on 16 Oct, 09:00–09:45?')).toBe(
      'Book Cut on 16 October at 09:00 to 09:45?',
    );
  });

  it('strips markdown noise without dropping words', () => {
    expect(
      speakableApproval('**Book** Cut for _Thandi_ on Fri 16 Oct, 20:30?'),
    ).toBe('Book Cut for Thandi on Friday 16 October at 20:30?');
  });

  it('does not touch a name that looks like a weekday', () => {
    expect(
      speakableApproval('Book Cut for Sunny Sat on Fri 16 Oct, 20:30?'),
    ).toContain('Sunny Sat');
  });
});

describe('trimForSpeech', () => {
  it('leaves a short reply alone', () => {
    expect(trimForSpeech('All caught up.')).toBe('All caught up.');
  });

  it('cuts a long reply at a sentence end', () => {
    const long = `${'First sentence here. '.repeat(30)}tail`;
    const out = trimForSpeech(long, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('.')).toBe(true);
  });
});

describe('askCompanion', () => {
  it('shows and speaks the reply, no follow-up for a statement', async () => {
    const out = await askCompanion(
      'how is today',
      deps({ reply: 'You have 3 bookings.', approvals: [] }),
    );
    expect(out).toEqual({
      status: 'done',
      message: 'You have 3 bookings.',
      spoken: 'You have 3 bookings.',
    });
  });

  it('expects a reply when the reply ends with a question', async () => {
    const out = await askCompanion(
      'x',
      deps({ reply: 'Which Thandi did you mean?', approvals: [] }),
    );
    expect(out.expectsReply).toBe(true);
    expect(out.pendingApprovalId).toBeUndefined();
  });

  it('reads the approval after the reply, then asks for yes or no, and binds to its id', async () => {
    const out = await askCompanion(
      'book Thandi',
      deps({ reply: 'I can book that.', approvals: [A] }),
    );
    expect(out).toMatchObject({
      status: 'done',
      message: 'I can book that.',
      expectsReply: true,
      pendingApprovalId: 'oapr_A',
      pendingKind: 'create_appointment',
    });
    expect(out.spoken).toBe(
      'I can book that. Book Gel overlay for Thandi Ngwenya on Friday 16 October at 20:30 to 21:15? Say yes or no.',
    );
    expect(out.pendingQueue).toBeUndefined();
  });

  it('shows the title when the reply is empty', async () => {
    const out = await askCompanion('x', deps({ reply: '', approvals: [A] }));
    expect(out.message).toBe(A.title);
  });

  it('reads only the first of two approvals and queues the second by id', async () => {
    const out = await askCompanion('x', deps({ reply: '', approvals: [A, B] }));
    expect(out.pendingApprovalId).toBe('oapr_A');
    expect(out.spoken).toContain('2 changes to confirm');
    expect(out.spoken).toContain('Thandi Ngwenya');
    expect(out.spoken).not.toContain('Sipho');
    expect(parsePendingQueue(out.pendingQueue)).toEqual([B]);
    expect(out.pendingRemaining).toBe(1);
  });

  it.each([
    ['NOT_SIGNED_IN', 'open_app'],
    ['FEATURE_NOT_IN_PLAN', 'error'],
    ['UPSTREAM_COMPANION_ERROR', 'error'],
  ])('maps %s to %s', async (code, status) => {
    const d = deps();
    d.ask.mockRejectedValue(Object.assign(new Error('x'), { code }));
    expect((await askCompanion('x', d)).status).toBe(status);
  });
});

describe('approval id binding with two pending approvals', () => {
  const two = async () =>
    askCompanion('x', deps({ reply: '', approvals: [A, B] }));

  it('a yes approves the first id only, then reads the second', async () => {
    const first = await two();
    const d = deps();
    const second = await answerPendingApproval(
      'yes',
      {
        pendingApprovalId: first.pendingApprovalId!,
        pendingKind: first.pendingKind,
        pendingQueue: first.pendingQueue,
      },
      d,
    );
    expect(d.decide).toHaveBeenCalledTimes(1);
    expect(d.decide).toHaveBeenCalledWith('oapr_A', 'approve');
    expect(second).toMatchObject({
      status: 'done',
      expectsReply: true,
      pendingApprovalId: 'oapr_B',
      pendingKind: 'cancel_appointment',
    });
    expect(second.spoken).toBe(
      'Done. Booked. Next. Cancel Cut for Sipho Dlamini on Saturday 17 October at 09:00 to 09:45? Say yes or no.',
    );
    expect(second.pendingQueue).toBeUndefined();
  });

  it('then a no applies to the second id only', async () => {
    const first = await two();
    const d = deps();
    const second = await answerPendingApproval(
      'yes',
      { pendingApprovalId: 'oapr_A', pendingQueue: first.pendingQueue },
      d,
    );
    const last = await answerPendingApproval(
      'no',
      {
        pendingApprovalId: second.pendingApprovalId!,
        pendingKind: second.pendingKind,
        pendingQueue: second.pendingQueue,
      },
      d,
    );
    expect(d.decide.mock.calls).toEqual([
      ['oapr_A', 'approve'],
      ['oapr_B', 'decline'],
    ]);
    expect(last).toEqual({ status: 'done', message: "Okay, I won't." });
  });

  it('a no declines the first id and never touches the second', async () => {
    const first = await two();
    const d = deps();
    await answerPendingApproval(
      'no',
      { pendingApprovalId: 'oapr_A', pendingQueue: first.pendingQueue },
      d,
    );
    expect(d.decide.mock.calls).toEqual([['oapr_A', 'decline']]);
  });

  it('a failed decision stays an error, with no next approval read', async () => {
    const d = deps();
    d.decide.mockRejectedValue(
      Object.assign(new Error('x'), { code: 'WINDOW_CLOSED' }),
    );
    const out = await answerPendingApproval(
      'yes',
      { pendingApprovalId: 'oapr_A', pendingQueue: JSON.stringify([B]) },
      d,
    );
    expect(out).toEqual({ status: 'error', message: 'Expired.' });
  });

  it('wording follows the kind', () => {
    expect(doneMessage('create_appointment', t)).toBe('Done. Booked.');
    expect(doneMessage('reschedule_appointment', t)).toBe('Done. Moved.');
    expect(doneMessage('cancel_appointment', t)).toBe('Done. Cancelled.');
    expect(doneMessage('something_new', t)).toBe('Done.');
    expect(doneMessage(null, t)).toBe('Done.');
  });
});

describe('parsePendingQueue', () => {
  it.each([undefined, '', 'nope', '{}', '[1,2]'])(
    '%j gives an empty queue',
    (json) => {
      expect(parsePendingQueue(json)).toEqual([]);
    },
  );
});

describe('follow-up turns through the headless task', () => {
  function headless(
    result?: AskResult,
  ): HeadlessDeps & { ask: jest.Mock; decide: jest.Mock; checkIn: jest.Mock } {
    const base = deps(result);
    return {
      ...base,
      now: () => new Date('2026-10-15T08:00:00Z'),
      isSignedIn: async () => true,
      loadToday: async () => ({
        appointments: [],
        timezone: 'Africa/Johannesburg',
      }),
      checkIn: jest.fn(async () => ({})),
      undo: jest.fn(async () => ({})),
    };
  }

  it('a yes with a pending approval decides that id and does not call ask', async () => {
    const d = headless();
    const out = await runVoiceCommandHeadless('yes', d, {
      pendingApprovalId: 'oapr_A',
      pendingKind: 'create_appointment',
    });
    expect(d.decide).toHaveBeenCalledWith('oapr_A', 'approve');
    expect(d.ask).not.toHaveBeenCalled();
    expect(out).toMatchObject({ status: 'done', message: 'Done. Booked.' });
  });

  it('a no declines it', async () => {
    const d = headless();
    const out = await runVoiceCommandHeadless('no', d, {
      pendingApprovalId: 'oapr_A',
    });
    expect(d.decide).toHaveBeenCalledWith('oapr_A', 'decline');
    expect(out.message).toBe("Okay, I won't.");
  });

  it('anything else continues the conversation and decides nothing', async () => {
    const d = headless({ reply: 'Moved to 9. Shall I?', approvals: [] });
    const out = await runVoiceCommandHeadless('make it nine instead', d, {
      pendingApprovalId: 'oapr_A',
    });
    expect(d.decide).not.toHaveBeenCalled();
    expect(d.ask).toHaveBeenCalledWith('make it nine instead');
    expect(out.expectsReply).toBe(true);
  });

  it('a yes with no pending approval is an ordinary message, never an approval', async () => {
    const d = headless({ reply: 'Okay.', approvals: [] });
    await runVoiceCommandHeadless('yes', d, {});
    expect(d.decide).not.toHaveBeenCalled();
    expect(d.ask).toHaveBeenCalledWith('yes');
  });
});

describe('replyExpectsAnswer', () => {
  it.each([
    ['Booked it.', undefined, false],
    ['Thandi is at 10:00. Then Sam at 11:00.', undefined, false],
    ['Which Thandi did you mean?', undefined, true],
    ['Which Thandi? I found two of them.', undefined, true],
    ['I can move it to 11:00. Shall I do that', undefined, true],
    ['Should I book her in for Friday.', undefined, true],
    ['Do you want me to message her.', undefined, true],
    ['Would you like a reminder sent.', undefined, true],
    ['Want me to move it.', undefined, true],
    ['Let me know if that works.', undefined, true],
    ['Please confirm.', undefined, true],
    ['Say go ahead and I will.', undefined, true],
    ['Is it ok? That was one. Two. Three. Nothing more.', undefined, false],
    ['', undefined, false],
    ['Which Thandi did you mean?', false, false],
    ['All set.', true, true],
  ] as [string, boolean | undefined, boolean][])(
    '%j with awaitingReply %s gives %s',
    (reply, awaitingReply, expected) => {
      expect(replyExpectsAnswer(reply, awaitingReply)).toBe(expected);
    },
  );

  it('askCompanion waits on a confirmation phrase without a question mark', async () => {
    const out = await askCompanion(
      'x',
      deps({
        reply: 'I can move her to 11:00. Shall I do that.',
        approvals: [],
      }),
    );
    expect(out.expectsReply).toBe(true);
    expect(out.pendingApprovalId).toBeUndefined();
  });

  it('askCompanion does not wait when only suggestions are present', async () => {
    const out = await askCompanion(
      'x',
      deps({
        reply: 'All set.',
        approvals: [],
        suggestions: ['Show today'],
      }),
    );
    expect(out.expectsReply).toBeUndefined();
  });

  it('askCompanion lets awaitingReply override the heuristic both ways', async () => {
    const yes = await askCompanion(
      'x',
      deps({ reply: 'All set.', approvals: [], awaitingReply: true }),
    );
    expect(yes.expectsReply).toBe(true);
    const no = await askCompanion(
      'x',
      deps({ reply: 'Which Thandi?', approvals: [], awaitingReply: false }),
    );
    expect(no.expectsReply).toBeUndefined();
  });
});
