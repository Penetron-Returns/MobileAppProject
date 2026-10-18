const mockFetchQuery = jest.fn();
jest.mock('@/lib/query', () => ({
  qk: { me: ['me'] },
  queryClient: { fetchQuery: (...a: unknown[]) => mockFetchQuery(...a) },
}));
jest.mock('@/lib/api', () => ({ api: { me: jest.fn() } }));

import { isReturnLink, redirectSystemPath } from '@/app/+native-intent';

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchQuery.mockResolvedValue({});
});

describe('redirectSystemPath', () => {
  it.each([
    'clovie://checkout/success',
    'clovie-preview://checkout/success?session_id=cs_1',
    'bookingadmin://checkout',
    'clovie://checkout/cancel',
    'clovie://billing/return',
    '/checkout/success',
    'checkout/anything',
  ])('sends %s to the root and refreshes me', (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe('/');
    expect(mockFetchQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    '/calendar',
    'clovie://booking/123',
    '/checkoutx',
    'clovie://oauth-native-callback',
  ])('leaves %s alone', (path) => {
    expect(redirectSystemPath({ path, initial: false })).toBe(path);
    expect(mockFetchQuery).not.toHaveBeenCalled();
  });

  it('still redirects when the refresh fails (signed out, offline)', () => {
    mockFetchQuery.mockRejectedValue(new Error('401'));
    expect(
      redirectSystemPath({ path: 'clovie://checkout/success', initial: true }),
    ).toBe('/');
    expect(isReturnLink('clovie://checkout/success')).toBe(true);
  });
});
