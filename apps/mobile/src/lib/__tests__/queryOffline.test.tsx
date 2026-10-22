import '@/lib/i18n';

import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { isApiError } from '../api';
import { useApiMutation } from '../query';
import { toast } from '../toast';

jest.mock('../toast', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const mutationFn = jest.fn();

// Unmount so pending query notifications cannot fire after the suite ends.
const mounted: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

function mount() {
  const ref: { current: ReturnType<typeof useApiMutation<string>> | null } = {
    current: null,
  };
  function Probe() {
    ref.current = useApiMutation<string>({ mutationFn });
    return null;
  }
  act(() => {
    mounted.push(
      renderer.create(
        <QueryClientProvider client={new QueryClient()}>
          <Probe />
        </QueryClientProvider>,
      ),
    );
  });
  return ref as { current: NonNullable<typeof ref.current> };
}

beforeEach(() => {
  mutationFn.mockReset().mockResolvedValue('ok');
  jest.mocked(toast.error).mockClear();
});
afterEach(() => onlineManager.setOnline(true));

describe('useApiMutation offline', () => {
  it('sends nothing and tells the user when a write is attempted offline', () => {
    onlineManager.setOnline(false);
    const m = mount();
    act(() => m.current.mutate('x'));
    expect(mutationFn).not.toHaveBeenCalled();
    const shown = jest.mocked(toast.error).mock.calls[0][0];
    expect(isApiError(shown) && shown.code).toBe('OFFLINE');
  });

  it('rejects mutateAsync with an offline error', async () => {
    onlineManager.setOnline(false);
    const m = mount();
    const error = await m.current.mutateAsync('x').catch((e: unknown) => e);
    expect(isApiError(error) && error.code).toBe('OFFLINE');
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it('sends the write when online', async () => {
    const m = mount();
    await act(async () => {
      await m.current.mutateAsync('x');
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});
