import type { CheckInCandidate } from '../checkIn';
import { runVoiceCommandHeadless, type HeadlessDeps } from '../headless';

const NOW = new Date('2026-10-15T08:00:00Z');

const TEXT: Record<string, string> = {
  'voice.noAppointment': 'No one is due',
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

function deps(patch: Partial<HeadlessDeps> = {}): HeadlessDeps {
  return {
    now: () => NOW,
    t: (key, values) =>
      (TEXT[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k) =>
        String(values?.[k] ?? ''),
      ),
    isSignedIn: async () => true,
    loadToday: async () => [appt('a1', 'Sipho Dlamini')],
    checkIn: jest.fn(async () => ({})),
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
      loadToday: async () => [
        appt('a1', 'Sipho Dlamini'),
        appt('a2', 'Thandi Mokoena'),
      ],
    });
    await runVoiceCommandHeadless('Thandi has arrived', d);
    expect(d.checkIn).toHaveBeenCalledWith('a2');
  });

  it('reports when nobody is due, without checking anyone in', async () => {
    const d = deps({ loadToday: async () => [] });
    await expect(
      runVoiceCommandHeadless('client has arrived', d),
    ).resolves.toEqual({ status: 'error', message: 'No one is due' });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('refuses to check in someone else when the named client is not due', async () => {
    const d = deps();
    await expect(
      runVoiceCommandHeadless('Thandi has arrived', d),
    ).resolves.toEqual({ status: 'error', message: 'Nobody named Thandi' });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('asks the owner to open the app for a free-text request', async () => {
    await expect(
      runVoiceCommandHeadless('book Thandi for Friday', deps()),
    ).resolves.toEqual({
      status: 'open_app',
      message: 'book Thandi for Friday',
    });
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
