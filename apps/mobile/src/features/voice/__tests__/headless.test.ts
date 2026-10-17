import type { CheckInCandidate } from '../checkIn';
import { runVoiceCommandHeadless, type HeadlessDeps } from '../headless';

const NOW = new Date('2026-10-15T08:00:00Z');

const TEXT: Record<string, string> = {
  'voice.noOneDueNext': 'Not yet. Next: {{name}} at {{time}}',
  'voice.noMoreClients': 'No more clients today',
  'voice.noNameMatch': 'Nobody named {{name}}',
  'voice.failed': 'Could not check in',
  'voice.checkedIn': 'Checked in {{name}}',
  'today.unknownClient': 'Walk-in client',
};

function appt(id: string, name: string | null): CheckInCandidate {
  return {
    id,
    starts_at: '2026-10-15T07:55:00Z',
    ends_at: '2026-10-15T08:40:00Z',
    status: 'confirmed',
    checked_in_at: null,
    client: name ? { name } : null,
  };
}

function today(appointments: CheckInCandidate[]) {
  return { appointments, timezone: 'Africa/Johannesburg' };
}

function deps(patch: Partial<HeadlessDeps> = {}): HeadlessDeps {
  return {
    now: () => NOW,
    t: (key, values) =>
      (TEXT[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) =>
        String(values?.[k] ?? ''),
      ),
    isSignedIn: async () => true,
    loadToday: async () => today([appt('a1', 'Sipho Dlamini')]),
    checkIn: jest.fn(async () => ({})),
    ask: jest.fn(async () => ({
      reply: 'You have two bookings.',
      approvals: [],
    })),
    decide: jest.fn(async () => ({ kind: null })),
    undo: jest.fn(async () => ({})),
    ...patch,
  };
}

describe('runVoiceCommandHeadless', () => {
  it('checks in the client who is due and says who', async () => {
    const d = deps();
    await expect(
      runVoiceCommandHeadless('client has arrived', d),
    ).resolves.toEqual({ status: 'done', message: 'Checked in Sipho' });
    expect(d.checkIn).toHaveBeenCalledWith('a1');
  });

  it('uses the name that was said to pick the client', async () => {
    const d = deps({
      loadToday: async () =>
        today([appt('a1', 'Sipho Dlamini'), appt('a2', 'Thandi Mokoena')]),
    });
    await runVoiceCommandHeadless('Thandi has arrived', d);
    expect(d.checkIn).toHaveBeenCalledWith('a2');
  });

  it('reports when nobody is due, without checking anyone in', async () => {
    const d = deps({ loadToday: async () => today([]) });
    await expect(
      runVoiceCommandHeadless('client has arrived', d),
    ).resolves.toEqual({ status: 'error', message: 'No more clients today' });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('says who is next, in business-local time, when the next client is too far off', async () => {
    // 18:30Z is 20:30 in Johannesburg, 150 minutes after NOW.
    const later = {
      ...appt('a9', 'Thandi Mokoena'),
      starts_at: '2026-10-15T18:30:00Z',
      ends_at: '2026-10-15T19:15:00Z',
    };
    const d = deps({ loadToday: async () => today([later]) });
    await expect(
      runVoiceCommandHeadless('client has arrived', d),
    ).resolves.toEqual({
      status: 'error',
      message: 'Not yet. Next: Thandi at 20:30',
    });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('refuses to check in someone else when the named client is not due', async () => {
    const d = deps();
    await expect(
      runVoiceCommandHeadless('Thandi has arrived', d),
    ).resolves.toEqual({ status: 'error', message: 'Nobody named Thandi' });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('sends a free-text request to the companion and speaks its reply', async () => {
    const d = deps();
    await expect(
      runVoiceCommandHeadless('how many bookings today', d),
    ).resolves.toMatchObject({
      status: 'done',
      message: 'You have two bookings.',
    });
    expect(d.ask).toHaveBeenCalledWith('how many bookings today');
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('keeps "client has arrived" on the local path, without calling the companion', async () => {
    const d = deps();
    await runVoiceCommandHeadless('client has arrived', d);
    expect(d.ask).not.toHaveBeenCalled();
  });

  it('asks the owner to open the app for a request when there is no session', async () => {
    const d = deps({ isSignedIn: async () => false });
    await expect(
      runVoiceCommandHeadless('book Thandi for Friday', d),
    ).resolves.toEqual({
      status: 'open_app',
      message: 'book Thandi for Friday',
    });
    expect(d.ask).not.toHaveBeenCalled();
  });

  it('asks the owner to open the app when there is no signed-in session', async () => {
    const d = deps({ isSignedIn: async () => false });
    await expect(
      runVoiceCommandHeadless('client has arrived', d),
    ).resolves.toMatchObject({ status: 'open_app' });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('turns an API failure into a plain error message', async () => {
    const d = deps({
      checkIn: jest.fn(async () => {
        throw new Error('boom Sipho');
      }),
    });
    await expect(
      runVoiceCommandHeadless('client has arrived', d),
    ).resolves.toEqual({ status: 'error', message: 'Could not check in' });
  });
});

describe('spoken filler while the companion thinks', () => {
  it('speaks a filler before awaiting a companion turn', async () => {
    const order: string[] = [];
    const d = deps({
      speakInterim: jest.fn(() => void order.push('filler')),
      nextTurn: () => 0,
      ask: jest.fn(async () => {
        order.push('ask');
        return { reply: 'Two bookings.', approvals: [] };
      }),
    });
    await runVoiceCommandHeadless('what is on today', d);
    expect(order).toEqual(['filler', 'ask']);
    expect(d.speakInterim).toHaveBeenCalledWith('voice.ask.interim.0');
  });

  it('rotates the filler by turn number', async () => {
    const spoken: string[] = [];
    let turn = 0;
    const d = deps({
      speakInterim: (text) => void spoken.push(text),
      nextTurn: () => turn++,
    });
    for (let i = 0; i < 4; i += 1)
      await runVoiceCommandHeadless('hello there', d);
    expect(spoken).toEqual([
      'voice.ask.interim.0',
      'voice.ask.interim.1',
      'voice.ask.interim.2',
      'voice.ask.interim.0',
    ]);
  });

  it('stays silent for the local check-in path', async () => {
    const d = deps({ speakInterim: jest.fn() });
    await runVoiceCommandHeadless('client has arrived', d);
    expect(d.speakInterim).not.toHaveBeenCalled();
  });

  it('stays silent for a yes or no on a pending approval', async () => {
    const d = deps({ speakInterim: jest.fn() });
    await runVoiceCommandHeadless('yes', d, {
      pendingApprovalId: 'ap1',
      pendingKind: 'create_appointment',
    });
    expect(d.speakInterim).not.toHaveBeenCalled();
    expect(d.decide).toHaveBeenCalledWith('ap1', 'approve');
  });

  it('works when the build has no filler function', async () => {
    await expect(
      runVoiceCommandHeadless('what is on today', deps()),
    ).resolves.toMatchObject({ status: 'done' });
  });
});
