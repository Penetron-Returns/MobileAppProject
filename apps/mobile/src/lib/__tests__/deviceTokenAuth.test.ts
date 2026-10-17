import { apiRequest, isApiError } from '@/lib/api';
import {
  acceptsDeviceToken,
  setAuthTokenGetter,
  setDeviceTokenSource,
} from '@/lib/auth-token';

jest.mock('@/lib/env', () => ({
  env: { apiUrl: 'https://api.example.com' },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'key' }));

const response = (status: number, body: unknown = { data: { ok: true } }) =>
  ({
    ok: status < 400,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

const ANSWER = '/v1/attendance/c1/answer';

describe('device voice token fallback in apiRequest', () => {
  const fetchMock = jest.fn();
  const onRejected = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(response(200));
    onRejected.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    setAuthTokenGetter(async () => null);
    setDeviceTokenSource({ get: async () => 'cvt_device', onRejected });
  });

  it('answers an attendance check with the device token when there is no Clerk session', async () => {
    await apiRequest('POST', ANSWER, {
      body: { outcome: 'came' },
      idempotencyKey: 'k1',
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer cvt_device',
    );
  });

  it('prefers the Clerk session token when there is one', async () => {
    setAuthTokenGetter(async () => 'tok_clerk');
    await apiRequest('POST', ANSWER, { idempotencyKey: 'k1' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer tok_clerk',
    );
  });

  it('falls back when Clerk throws (no usable session in the background)', async () => {
    setAuthTokenGetter(async () => {
      throw new Error('no session');
    });
    await apiRequest('POST', ANSWER, { idempotencyKey: 'k1' });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer cvt_device',
    );
  });

  it.each([
    ['GET', '/v1/attendance/pending'],
    ['GET', '/v1/me'],
    ['POST', '/v1/appointments'],
    ['DELETE', '/v1/voice/device-token'],
    ['POST', '/v1/voice/device-token'],
  ])('never uses the device token for %s %s', async (method, path) => {
    const error = await apiRequest(
      method as 'GET' | 'POST' | 'DELETE',
      path,
      method === 'GET' ? {} : { idempotencyKey: 'k1' },
    ).catch((e: unknown) => e);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isApiError(error) && error.code).toBe('NOT_SIGNED_IN');
  });

  it('forgets the device token when the server answers 401', async () => {
    fetchMock.mockResolvedValue(
      response(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    );
    await expect(
      apiRequest('POST', ANSWER, { idempotencyKey: 'k1' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(onRejected).toHaveBeenCalledTimes(1);
  });

  it('does not touch the device token when a Clerk token got the 401', async () => {
    setAuthTokenGetter(async () => 'tok_clerk');
    fetchMock.mockResolvedValue(
      response(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
    );
    await expect(
      apiRequest('POST', ANSWER, { idempotencyKey: 'k1' }),
    ).rejects.toMatchObject({ status: 401 });
    expect(onRejected).not.toHaveBeenCalled();
  });

  it('fails without a request when neither credential exists', async () => {
    setDeviceTokenSource({ get: async () => null, onRejected });
    const error = await apiRequest('POST', ANSWER, {
      idempotencyKey: 'k1',
    }).catch((e: unknown) => e);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isApiError(error) && error.code).toBe('NOT_SIGNED_IN');
  });
});

describe('acceptsDeviceToken', () => {
  it.each([
    ['POST', '/v1/voice/transcriptions', true],
    ['POST', '/v1/attendance/abc/answer', true],
    ['GET', '/v1/voice/transcriptions', false],
    ['POST', '/v1/attendance/abc/answer/x', false],
    ['POST', '/v1/appointments/abc/check-in', true],
    ['GET', '/v1/appointments/abc/check-in', false],
    ['GET', '/v1/voice/today', true],
    ['POST', '/v1/voice/today', false],
    ['POST', '/v1/voice/ask', true],
    ['GET', '/v1/voice/ask', false],
    ['POST', '/v1/voice/approvals/oapr_1/approve', true],
    ['POST', '/v1/voice/approvals/oapr_1/decline', true],
    ['POST', '/v1/voice/approvals/oapr_1/other', false],
    ['POST', '/v1/voice/actions/oact_1/undo', true],
    ['GET', '/v1/voice/actions/oact_1/undo', false],
    ['POST', '/v1/voice/actions/oact_1/other', false],
    ['POST', '/v1/appointments/abc/status', false],
    ['POST', '/v1/appointments/abc/check-in/x', false],
  ])('%s %s is %s', (method, path, expected) => {
    expect(acceptsDeviceToken(method, path)).toBe(expected);
  });
});
