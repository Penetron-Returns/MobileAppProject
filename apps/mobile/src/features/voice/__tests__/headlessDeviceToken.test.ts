import { setAuthTokenGetter, setDeviceTokenSource } from '@/lib/auth-token';

import { runVoiceCommandHeadless } from '../headless';
import { createHeadlessDeps } from '../headlessTask';
import { toCheckInCandidates } from '../today';

const mockVoiceToday = jest.fn();
const mockCheckIn = jest.fn();
const mockFetchBetween = jest.fn();
jest.mock('@/lib/api', () => ({
  newIdempotencyKey: () => 'idem-key-0001',
  api: {
    voiceToday: () => mockVoiceToday(),
    checkInAppointment: (...a: unknown[]) => mockCheckIn(...a),
  },
}));
jest.mock('@/features/appointments/hooks', () => ({
  fetchAppointmentsBetween: (...a: unknown[]) => mockFetchBetween(...a),
}));
jest.mock('@/features/business/hooks', () => ({
  fetchBusiness: async () => ({ timezone: 'Africa/Johannesburg' }),
}));
jest.mock('../clovieVoice', () => ({
  completeCommand: jest.fn(),
  recordTiming: jest.fn(),
  setCloudStt: jest.fn(),
}));

const NOW = new Date('2026-10-15T08:00:00Z');
const today = {
  timezone: 'Africa/Johannesburg',
  appointments: [
    {
      id: 'a1',
      starts_at: '2026-10-15T07:55:00Z',
      ends_at: '2026-10-15T08:40:00Z',
      status: 'confirmed',
      checked_in_at: null,
      staff_id: 's1',
      client_first_name: 'Sipho',
      service_name: 'Cut',
    },
  ],
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  mockVoiceToday.mockReset().mockResolvedValue(today);
  mockCheckIn.mockReset().mockResolvedValue({});
  mockFetchBetween.mockReset();
  setAuthTokenGetter(async () => null);
  setDeviceTokenSource({
    get: async () => 'cvt_device',
    onRejected: jest.fn(),
  });
});
afterEach(() => jest.useRealTimers());

describe('headless check-in with only the device voice token', () => {
  it('reads today through /v1/voice/today and checks the client in', async () => {
    const outcome = await runVoiceCommandHeadless(
      'client has arrived',
      createHeadlessDeps(),
    );
    expect(outcome.status).toBe('done');
    expect(mockVoiceToday).toHaveBeenCalledTimes(1);
    expect(mockFetchBetween).not.toHaveBeenCalled();
    expect(mockCheckIn).toHaveBeenCalledWith('a1', 'idem-key-0001');
  });

  it('matches a spoken name against the first name the API sends', async () => {
    const outcome = await runVoiceCommandHeadless(
      'Sipho has arrived',
      createHeadlessDeps(),
    );
    expect(outcome.status).toBe('done');
    expect(mockCheckIn).toHaveBeenCalledWith('a1', 'idem-key-0001');
  });

  it('asks to open the app when neither a session nor a device token exists', async () => {
    setDeviceTokenSource({ get: async () => null, onRejected: jest.fn() });
    const outcome = await runVoiceCommandHeadless(
      'client has arrived',
      createHeadlessDeps(),
    );
    expect(outcome.status).toBe('open_app');
    expect(mockCheckIn).not.toHaveBeenCalled();
  });

  it('keeps reading through Supabase when a Clerk session exists', async () => {
    setAuthTokenGetter(async () => 'tok_clerk');
    mockFetchBetween.mockResolvedValue(toCheckInCandidates(today));
    const outcome = await runVoiceCommandHeadless(
      'client has arrived',
      createHeadlessDeps(),
    );
    expect(outcome.status).toBe('done');
    expect(mockVoiceToday).not.toHaveBeenCalled();
  });
});

describe('toCheckInCandidates', () => {
  it('maps the first name and drops everything else', () => {
    expect(toCheckInCandidates(today)).toEqual([
      {
        id: 'a1',
        starts_at: '2026-10-15T07:55:00Z',
        ends_at: '2026-10-15T08:40:00Z',
        status: 'confirmed',
        checked_in_at: null,
        client: { name: 'Sipho' },
      },
    ]);
  });
});
