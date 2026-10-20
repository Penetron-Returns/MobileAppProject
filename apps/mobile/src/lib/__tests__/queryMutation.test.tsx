import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { patchQueries, useApiMutation } from '../query';
import { toast } from '../toast';

jest.mock('../toast', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

function setup(
  opts: Partial<Parameters<typeof useApiMutation<number, string>>[0]>,
  mutationFn: () => Promise<string>,
) {
  const qc = new QueryClient();
  const ref: { current: ReturnType<typeof useApiMutation<number, string>> } = {
    current: null as never,
  };
  function Probe() {
    ref.current = useApiMutation<number, string>({ mutationFn, ...opts });
    return null;
  }
  act(() => {
    renderer.create(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return { qc, ref };
}

describe('patchQueries', () => {
  it('patches matching queries and restores them on rollback', () => {
    const qc = new QueryClient();
    qc.setQueryData(['a', 1], [1]);
    qc.setQueryData(['a', 2], [2]);
    qc.setQueryData(['b'], [9]);
    const rollback = patchQueries<number[]>(qc, { queryKey: ['a'] }, (o) => [
      ...o,
      0,
    ]);
    expect(qc.getQueryData(['a', 1])).toEqual([1, 0]);
    expect(qc.getQueryData(['a', 2])).toEqual([2, 0]);
    expect(qc.getQueryData(['b'])).toEqual([9]);
    rollback();
    expect(qc.getQueryData(['a', 1])).toEqual([1]);
    expect(qc.getQueryData(['a', 2])).toEqual([2]);
  });
});

describe('useApiMutation', () => {
  it('calls onSuccess before a slow invalidation refetch finishes', async () => {
    const onSuccess = jest.fn();
    const { qc, ref } = setup(
      { invalidate: [['x']], onSuccess, successMessage: 'ok' },
      () => Promise.resolve('done'),
    );
    const spy = jest
      .spyOn(qc, 'invalidateQueries')
      .mockReturnValue(new Promise(() => undefined));
    await act(async () => {
      ref.current.mutate(1);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onSuccess).toHaveBeenCalledWith('done', 1);
    expect(toast.success).toHaveBeenCalledWith('ok');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['x'] });
  });

  it('applies the optimistic patch first and rolls back on error', async () => {
    let seenDuringRequest: unknown;
    const { qc, ref } = setup(
      {
        optimistic: (_v, c) =>
          patchQueries<number>(c, { queryKey: ['n'] }, () => 2),
        onError: () => true,
        invalidate: [['n']],
      },
      () => {
        seenDuringRequest = qc.getQueryData(['n']);
        return Promise.reject(new Error('boom'));
      },
    );
    qc.setQueryData(['n'], 1);
    await act(async () => {
      ref.current.mutate(1);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(seenDuringRequest).toBe(2);
    expect(qc.getQueryData(['n'])).toBe(1);
  });
});
