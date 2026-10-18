import {
  isEchoCandidate,
  keysToInvalidate,
  realtimeTables,
  shouldListen,
} from '../tables';

describe('realtime tables', () => {
  it('always listens to bookings and attendance', () => {
    expect(realtimeTables(false)).toEqual(
      expect.arrayContaining(['appointments', 'attendance_checks']),
    );
  });

  it('adds the inbox tables only with an inbox plan', () => {
    expect(realtimeTables(true)).toEqual(
      expect.arrayContaining(['conversations', 'messages', 'escalations']),
    );
    expect(realtimeTables(false)).not.toContain('messages');
  });

  it('refreshes appointment-derived queries when an appointment changes', () => {
    expect(keysToInvalidate('appointments')).toEqual([
      { key: ['appointments'], refetchType: 'active' },
      { key: ['dashboard'], refetchType: 'active' },
      { key: ['clients', 'book'], refetchType: 'none' },
    ]);
  });

  it.each([
    'business_hours',
    'business_special_days',
    'availability_rules',
    'availability_overrides',
    'staff_breaks',
    'staff_time_off',
  ] as const)(
    '%s refreshes the availability config, days and slots',
    (table) => {
      expect(realtimeTables(false)).toContain(table);
      const keys = keysToInvalidate(table).map((k) => k.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          ['availability-config'],
          ['business-hours'],
          ['availability', 'days'],
          ['availability', 'slots'],
        ]),
      );
    },
  );

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
