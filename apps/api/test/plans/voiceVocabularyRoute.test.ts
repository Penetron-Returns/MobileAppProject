import { describe, expect, it } from 'vitest';

import { createHttpNerovaClient } from '@booking/companion/nerova/httpClient.ts';
import type { NerovaClient } from '@booking/companion/nerova/client.ts';
import type { BookingRepository } from '@booking/features/repositories/types.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import type { Container } from '../../src/container.ts';
import { addAppointment, addClient, DAY, vocabularyRepo } from '../voice/vocabularyFixtures.ts';
import { BIZ, NEROVA_KEY, plansHarness } from './harness.ts';

const ready = { id: 'acct_100', externalReference: BIZ, provisioningState: 'ready' };
const ON = { VOICE_CLOUD_STT: 'true' } as const;

function withClients(...names: string[]) {
  const { repo } = vocabularyRepo(BIZ);
  for (const name of names) addAppointment(repo, BIZ, addClient(repo, BIZ, name).id, DAY / 2);
  return { bookingRepository: repo } as unknown as Partial<Container>;
}

/** The real HTTP client over a scripted fetch; the account lookup is stubbed so only transcription hits the fetch. */
function httpOver(responder: (form: FormData) => Response): { client: NerovaClient; forms: FormData[] } {
  const forms: FormData[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    forms.push(init.body as FormData);
    return responder(init.body as FormData);
  }) as unknown as typeof fetch;
  const real = createHttpNerovaClient({ apiKey: NEROVA_KEY, fetch: impl });
  return { client: { ...real, getAccount: async () => ({ id: 'acct_100', provisioningState: 'ready' }) }, forms };
}

const okResponse = () => new Response(JSON.stringify({ text: 'ok', durationMs: 1, language: 'en' }), { status: 200 });
const vocabOf = (form: FormData | undefined) => {
  const v = form?.get('vocabulary');
  return typeof v === 'string' ? v : null;
};

function post(h: ReturnType<typeof plansHarness>) {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(500)], { type: 'audio/wav' }), 'clip.wav');
  return h.app.request('/v1/voice/transcriptions', {
    method: 'POST',
    headers: { authorization: 'Bearer owner', 'idempotency-key': 'voice-vocab-key-000001' },
    body: form,
  });
}

describe('POST /v1/voice/transcriptions vocabulary', () => {
  it('forwards client first names as a comma-separated vocabulary', async () => {
    const h = plansHarness({ accounts: [ready], env: ON, overrides: withClients('Thandi Nkosi', 'Sipho Dlamini') });
    expect((await post(h)).status).toBe(200);
    expect(h.nerova.transcriptionRequests[0]?.vocabulary?.split(',').sort()).toEqual(['Sipho', 'Thandi']);
  });

  it('sends the vocabulary multipart field to Nerova', async () => {
    const { client, forms } = httpOver(okResponse);
    const h = plansHarness({ accounts: [ready], env: ON, overrides: withClients('Thandi'), nerovaClient: client });
    expect((await post(h)).status).toBe(200);
    expect(vocabOf(forms[0])).toBe('Thandi');
  });

  it('transcribes without the field when the business has no clients', async () => {
    const h = plansHarness({ accounts: [ready], env: ON, overrides: withClients() });
    expect((await post(h)).status).toBe(200);
    expect(h.nerova.transcriptionRequests[0]).not.toHaveProperty('vocabulary');
  });

  it('transcribes without the field when building it fails', async () => {
    const broken = {
      getBusiness: async () => {
        throw new Error('db down');
      },
    } as unknown as BookingRepository;
    const h = plansHarness({ accounts: [ready], env: ON, overrides: { bookingRepository: broken } as unknown as Partial<Container> });
    expect((await post(h)).status).toBe(200);
    expect(h.nerova.transcriptionRequests[0]).not.toHaveProperty('vocabulary');
  });

  it('retries once without the vocabulary on 400 transcription.invalid_request', async () => {
    const { client, forms } = httpOver((form) =>
      form.get('vocabulary')
        ? new Response(JSON.stringify({ code: 'transcription.invalid_request' }), { status: 400, headers: { 'content-type': 'application/problem+json' } })
        : okResponse(),
    );
    const h = plansHarness({ accounts: [ready], env: ON, overrides: withClients('Thandi'), nerovaClient: client });
    expect((await post(h)).status).toBe(200);
    expect(forms.map(vocabOf)).toEqual(['Thandi', null]);
  });

  it('does not retry a different failure', async () => {
    const { client, forms } = httpOver(() => new Response(JSON.stringify({ code: 'transcription.unavailable' }), { status: 503 }));
    const h = plansHarness({ accounts: [ready], env: ON, overrides: withClients('Thandi'), nerovaClient: client });
    expect((await post(h)).status).toBeGreaterThanOrEqual(500);
    expect(forms).toHaveLength(1);
  });

  it('never writes the names to the console', async () => {
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn'] as const).map((k) => {
      const original = console[k];
      console[k] = (...a: unknown[]) => void lines.push(JSON.stringify(a));
      return () => void (console[k] = original);
    });
    try {
      await post(plansHarness({ accounts: [ready], env: ON, overrides: withClients('Thandi') }));
    } finally {
      spies.forEach((restore) => restore());
    }
    expect(lines.join('\n')).not.toContain('Thandi');
  });
});

describe('companion transcribe vocabulary retry', () => {
  it('rethrows a 400 that is not about the request shape, without retrying', async () => {
    const h = plansHarness({ accounts: [ready], env: ON });
    let calls = 0;
    h.nerova.transcribe = async () => {
      calls += 1;
      throw new AppError('VALIDATION_FAILED', 'The audio was rejected', { reason: 'transcription.bad_audio' });
    };
    const file = { data: new Blob([new Uint8Array(5)]), filename: 'a.wav', contentType: 'audio/wav' };
    await expect(h.container.companion.transcribe(BIZ, file, { vocabulary: 'Thandi' })).rejects.toThrow('rejected');
    expect(calls).toBe(1);
  });
});
