import {
  appVersionLabel,
  SETTINGS_ROUTES,
  settingsGroups,
} from '../navigation';

describe('settingsGroups', () => {
  it('lists the groups in the agreed order, one row set for everyone', () => {
    expect(settingsGroups().map((g) => [g.id, g.items])).toEqual([
      ['business', ['businessDetails', 'hours', 'services', 'rules', 'team']],
      ['channel', ['whatsapp']],
      ['account', ['notifications', 'appearance', 'haptics', 'deleteAccount']],
    ]);
  });

  it('takes no role or platform, so nothing can be dropped for them', () => {
    expect(settingsGroups.length).toBe(0);
  });

  it('keeps attendance, voice and client reminders off the home list', () => {
    const items = settingsGroups().flatMap((g) => g.items) as string[];
    for (const nested of ['attendance', 'voice', 'reminders']) {
      expect(items).not.toContain(nested);
    }
  });

  it('opens every row but the appearance switch on a settings route', () => {
    for (const item of settingsGroups().flatMap((g) => g.items)) {
      if (item === 'appearance' || item === 'haptics') continue;
      expect(SETTINGS_ROUTES[item]).toMatch(/^\/settings\//);
    }
  });
});

describe('appVersionLabel', () => {
  it.each([
    ['Booking', '1.0.0', '24', 'Booking 1.0.0 (24)'],
    ['Booking', '1.0.0', null, 'Booking 1.0.0'],
  ])('formats %s %s build %s', (name, version, build, expected) => {
    expect(appVersionLabel(name, version, build)).toBe(expected);
  });
});
