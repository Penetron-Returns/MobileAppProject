import { NOT_HEARD, runVoiceClipHeadless, type ClipDeps } from '../headless';

const NOW = new Date('2026-10-15T08:00:00Z');

function deps(patch: Partial<ClipDeps> = {}): ClipDeps {
  return {
    now: () => NOW,
    t: (key, values) => `${key}:${String(values?.name ?? '')}`,
    isSignedIn: async () => true,
    loadToday: async () => [
      {
        id: 'a1',
        starts_at: '2026-10-15T07:55:00Z',
        ends_at: '2026-10-15T08:40:00Z',
        status: 'confirmed',
        checked_in_at: null,
        client: { name: 'Sipho Dlamini' },
      },
    ],
    checkIn: jest.fn(async () => ({})),
    transcribe: jest.fn(async () => ({ text: 'Sipho has arrived' })),
    ...patch,
  };
}

describe('runVoiceClipHeadless', () => {
  it('uploads the clip and runs the transcript as a command', async () => {
    const d = deps();
    await expect(runVoiceClipHeadless('/cache/c.wav', d)).resolves.toEqual({
      status: 'done',
      message: 'voice.checkedIn:Sipho',
      transcript: 'Sipho has arrived',
    });
    expect(d.transcribe).toHaveBeenCalledWith('/cache/c.wav');
    expect(d.checkIn).toHaveBeenCalledWith('a1');
  });

  it('hands a free-text request to the app with what was heard', async () => {
    const d = deps({
      transcribe: async () => ({ text: 'move my 3pm to Friday' }),
    });
    await expect(runVoiceClipHeadless('/c.wav', d)).resolves.toMatchObject({
      status: 'open_app',
      transcript: 'move my 3pm to Friday',
    });
  });

  it('flags a fallback when the upload fails (404 before the backend is live)', async () => {
    const d = deps({
      transcribe: async () => {
        throw Object.assign(new Error('Not found'), { status: 404 });
      },
    });
    await expect(runVoiceClipHeadless('/c.wav', d)).resolves.toEqual({
      status: 'fallback',
      message: '',
    });
    expect(d.checkIn).not.toHaveBeenCalled();
  });

  it('says it did not catch that when the clip has no words', async () => {
    const d = deps({ transcribe: async () => ({ text: '  ' }) });
    await expect(runVoiceClipHeadless('/c.wav', d)).resolves.toEqual({
      status: 'error',
      message: NOT_HEARD,
    });
  });
});
