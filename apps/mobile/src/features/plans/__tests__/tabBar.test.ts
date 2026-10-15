import { tabBarActions } from '../tabBar';

describe('tabBarActions', () => {
  it('keeps the plus and New booking on Free, without Reports', () => {
    expect(tabBarActions('free')).toEqual({
      tabs: ['index', 'calendar', 'clients', 'settings'],
      addRoute: '/new-booking',
    });
  });
  it('shows Reports as an ordinary tab, with no plus, on paid plans', () => {
    expect(tabBarActions('ai')).toEqual({
      tabs: ['index', 'calendar', 'reports', 'clients', 'settings'],
      addRoute: null,
    });
  });
});
