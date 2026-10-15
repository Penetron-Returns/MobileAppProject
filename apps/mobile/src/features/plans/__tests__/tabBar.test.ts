import { tabBarActions } from '../tabBar';

describe('tabBarActions', () => {
  it('keeps the plus and New booking on Free', () => {
    expect(tabBarActions('free')).toEqual({
      center: 'add',
      centerRoute: '/new-booking',
    });
  });
  it('opens Reports from the centre on paid plans', () => {
    expect(tabBarActions('ai')).toEqual({
      center: 'reports',
      centerRoute: '/reports',
    });
  });
});
