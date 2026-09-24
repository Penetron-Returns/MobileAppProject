import { ApiError, buildUrl, isApiError, parseEnvelope } from '@/lib/api';

/** Minimal fetch Response stand-in: only what parseEnvelope reads. */
function fakeResponse(opts: {
  ok: boolean;
  status: number;
  body?: unknown;
  requestId?: string | null;
}) {
  return {
    ok: opts.ok,
    status: opts.status,
    headers: {
      get: (name: string) =>
        name === 'x-request-id' ? (opts.requestId ?? null) : null,
    },
    text: async () =>
      opts.body === undefined ? '' : JSON.stringify(opts.body),
  } as unknown as Response;
}

describe('buildUrl', () => {
  it('appends a query string, skipping empty values', () => {
    expect(
      buildUrl('https://api.example.com', '/v1/clients', {
        search: 'jane',
        empty: '',
        skip: undefined,
        nullish: null,
      }),
    ).toBe('https://api.example.com/v1/clients?search=jane');
  });

  it('returns the bare path when there is no query', () => {
    expect(buildUrl('https://api.example.com', '/health')).toBe(
      'https://api.example.com/health',
    );
  });
});

describe('parseEnvelope', () => {
  it('unwraps the {data} envelope on success', async () => {
    const res = fakeResponse({
      ok: true,
      status: 200,
      body: { data: { id: '1' } },
    });
    await expect(parseEnvelope<{ id: string }>(res)).resolves.toEqual({
      id: '1',
    });
  });

  it('throws a typed ApiError from the {error} envelope', async () => {
    const res = fakeResponse({
      ok: false,
      status: 409,
      requestId: 'req_abc',
      body: {
        error: {
          code: 'SLOT_UNAVAILABLE',
          message: 'Taken',
          request_id: 'req_abc',
        },
      },
    });
    await expect(parseEnvelope(res)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'SLOT_UNAVAILABLE',
      status: 409,
      requestId: 'req_abc',
    });
  });

  it('falls back to a BAD_RESPONSE/INTERNAL ApiError for a malformed body', async () => {
    const res = fakeResponse({ ok: false, status: 500, body: undefined });
    await expect(parseEnvelope(res)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 500,
    });
  });
});

describe('ApiError', () => {
  it('is retryable for network errors and 5xx, not for 4xx', () => {
    expect(
      new ApiError({ code: 'NETWORK_ERROR', message: '', status: 0 })
        .isRetryable,
    ).toBe(true);
    expect(
      new ApiError({ code: 'INTERNAL', message: '', status: 500 }).isRetryable,
    ).toBe(true);
    expect(
      new ApiError({ code: 'VALIDATION_FAILED', message: '', status: 400 })
        .isRetryable,
    ).toBe(false);
  });

  it('isApiError narrows unknown errors', () => {
    const err = new ApiError({
      code: 'NOT_FOUND',
      message: 'nope',
      status: 404,
    });
    expect(isApiError(err)).toBe(true);
    expect(isApiError(new Error('plain'))).toBe(false);
  });
});
