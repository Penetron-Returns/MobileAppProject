import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { qk } from '@/lib/query';

import CompanionWhatsAppReturn from '../companion/whatsapp-return';

let mockParams: Record<string, string | string[]> = {};
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  useLocalSearchParams: () => mockParams,
}));
const mockInfo = jest.fn();
jest.mock('@/lib/toast', () => ({
  toast: { info: (...a: unknown[]) => mockInfo(...a) },
}));

function open(params: Record<string, string | string[]>) {
  mockParams = params;
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <CompanionWhatsAppReturn />
      </QueryClientProvider>,
    );
  });
  act(() => tree.unmount());
  client.clear();
  return invalidate;
}

beforeEach(() => jest.clearAllMocks());

describe('companion whatsapp-return route', () => {
  it.each(['success', 'cancelled'])(
    'refetches setup and lands on the companion for status=%s, with no toast',
    (status) => {
      const invalidate = open({ status, sessionId: 's1' });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: qk.companionSetup,
      });
      expect(mockRedirect).toHaveBeenCalledWith('/companion');
      expect(mockInfo).not.toHaveBeenCalled();
    },
  );

  it('shows a short toast on status=failure', () => {
    const invalidate = open({ status: 'failure' });
    expect(invalidate).toHaveBeenCalled();
    expect(mockInfo).toHaveBeenCalledWith(
      'WhatsApp did not finish connecting. Try again.',
    );
    expect(mockRedirect).toHaveBeenCalledWith('/companion');
  });

  it('still works with no params (the auth session consumed the url)', () => {
    open({});
    expect(mockRedirect).toHaveBeenCalledWith('/companion');
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('reads the first value when the status param repeats', () => {
    open({ status: ['failure', 'success'] });
    expect(mockInfo).toHaveBeenCalledTimes(1);
  });
});
