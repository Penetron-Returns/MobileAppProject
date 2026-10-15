import { apiRequest, isApiError } from '@/lib/api';
import { setAuthTokenGetter } from '@/lib/auth-token';

jest.mock('@/lib/env', () => ({
  env: { apiUrl: 'https://api.example.com' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key' }));

const okResponse = () =>
  ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ data: { ok: true } }),
  }) as unknown as Response;

describe('apiRequest authentication', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(okResponse());
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('attaches the bearer token when one is available', async () => {
    setAuthTokenGetter(async () => 'tok_123');
    await apiRequest('GET', '/v1/me');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer tok_123',
    );
  });

  it('waits for an async token instead of sending without it', async () => {
    let release!: (token: string) => void;
    setAuthTokenGetter(
      () => new Promise<string | null>((resolve) => (release = resolve)),
    );
    const pending = apiRequest('GET', '/v1/me');
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
    release('tok_late');
    await pending;
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer tok_late',
    );
  });

  it('fails clearly, without any request, when no token is available', async () => {
    setAuthTokenGetter(async () => null);
    const error = await apiRequest('GET', '/v1/me').catch((e: unknown) => e);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isApiError(error) && error.code).toBe('NOT_SIGNED_IN');
    expect(isApiError(error) && error.status).toBe(401);
  });

  it('still allows public calls without a token', async () => {
    setAuthTokenGetter(async () => null);
    await apiRequest('GET', '/public/x', { auth: false });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
});
