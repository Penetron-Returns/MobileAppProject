import { apiRequest } from '@/lib/api';

jest.mock('@/lib/env', () => ({ env: { apiUrl: 'https://api.example.com' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key' }));
jest.mock('expo-application', () => ({
  applicationId: 'app.getclovie.preview',
}));

describe('apiRequest build identity', () => {
  const realFetch = global.fetch;
  let headers: Record<string, string> = {};
  beforeEach(() => {
    global.fetch = (async (_url: unknown, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => '{"data":{}}',
      };
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends the application id on companion calls', async () => {
    await apiRequest('POST', '/v1/companion/session', {
      auth: false,
      idempotencyKey: 'k',
      body: {},
    });
    expect(headers['X-Clovie-App-Id']).toBe('app.getclovie.preview');
  });

  it('does not send it on unrelated calls', async () => {
    await apiRequest('GET', '/v1/me', { auth: false });
    expect(headers['X-Clovie-App-Id']).toBeUndefined();
  });
});
