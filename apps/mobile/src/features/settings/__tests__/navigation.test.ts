import { settingsGroups } from '../navigation';

describe('settingsGroups', () => {
  it('gives owners the business and account groups', () => {
    expect(settingsGroups(true).map((g) => g.id)).toEqual([
      'business',
      'account',
    ]);
    expect(settingsGroups(true)[0].items).toEqual([
      'businessDetails',
      'hours',
      'services',
      'team',
      'rules',
    ]);
  });

  it('gives staff only notifications', () => {
    expect(settingsGroups(false)).toEqual([
      { id: 'account', items: ['notifications'] },
    ]);
  });
});
