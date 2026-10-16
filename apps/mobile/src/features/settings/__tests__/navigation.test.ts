import { appVersionLabel, settingsGroups } from '../navigation';

describe('settingsGroups', () => {
  it('gives owners the business, customize and account groups, all titled', () => {
    const groups = settingsGroups(true);
    expect(groups.map((g) => g.id)).toEqual([
      'business',
      'customize',
      'account',
    ]);
    expect(groups.every((g) => g.titled)).toBe(true);
    expect(groups[0].items).toEqual([
      'businessDetails',
      'hours',
      'services',
      'team',
      'rules',
      'attendance',
    ]);
    expect(groups[1].items).toEqual(['whatsapp']);
    expect(groups[2].items).toEqual(['plan', 'notifications', 'deleteAccount']);
  });

  it('swaps WhatsApp for the Companion on paid plans', () => {
    expect(settingsGroups(true, 'ai')[1].items).toEqual(['companion']);
  });

  it('gives staff one untitled group with notifications and delete account', () => {
    expect(settingsGroups(false)).toEqual([
      {
        id: 'account',
        items: ['notifications', 'deleteAccount'],
        titled: false,
      },
    ]);
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

describe('settingsGroups with Hey Clovie', () => {
  it('adds the voice row after the customize item on devices that support it', () => {
    expect(settingsGroups(true, 'free', { hasVoice: true })[1].items).toEqual([
      'whatsapp',
      'voice',
    ]);
    expect(settingsGroups(true, 'ai', { hasVoice: true })[1].items).toEqual([
      'companion',
      'voice',
    ]);
  });

  it('never shows it to staff', () => {
    expect(settingsGroups(false, 'free', { hasVoice: true })[0].items).toEqual([
      'notifications',
      'deleteAccount',
    ]);
  });
});
