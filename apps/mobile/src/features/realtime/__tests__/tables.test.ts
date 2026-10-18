import {
  isEchoCandidate,
  keysToInvalidate,
  realtimeTables,
  shouldListen,
} from '../tables';

describe('realtime tables', () => {
  it('always listens to bookings and attendance', () => {
    expect(realtimeTables(false)).toEqual([
      'appointments',
      'attendance_checks',
    ]);
  });

  it('adds the inbox tables only with an inbox plan', () => {
    expect(realtimeTables(true)).toEqual([
      'appointments',
      'attendance_checks',
      'conversations',
      'messages',
      'escalations',
    ]);
  });

  it('refreshes appointment-derived queries when an appointment changes', () => {
    expect(keysToInvalidate('appointments')).toEqual([
      { key: ['appointments'], refetchType: 'active' },
      { key: ['dashboard'], refetchType: 'active' },
      { key: ['clients', 'book'], refetchType: 'none' },
    ]);
  });

  it('only ignores echoes of tables this device writes to', () => {
    expect(isEchoCandidate('appointments')).toBe(true);
    expect(isEchoCandidate('messages')).toBe(false);
  });

  it.each([
    [true, 'active', true],
    [true, 'background', false],
    [true, 'inactive', true],
    [false, 'active', false],
  ])('enabled=%s appState=%s -> listen=%s', (enabled, state, expected) => {
    expect(shouldListen(enabled, state)).toBe(expected);
  });
});
