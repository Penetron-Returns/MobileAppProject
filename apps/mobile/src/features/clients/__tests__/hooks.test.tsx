import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { qk } from '@/lib/query';

import {
  useAddClientNote,
  useClientPreview,
  useDeleteClientNote,
  useUpdateClient,
} from '../hooks';

const mockApi = {
  addClientNote: jest.fn(),
  deleteClientNote: jest.fn(),
  updateClient: jest.fn(),
};
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: {
    addClientNote: (...a: unknown[]) => mockApi.addClientNote(...a),
    deleteClientNote: (...a: unknown[]) => mockApi.deleteClientNote(...a),
    updateClient: (...a: unknown[]) => mockApi.updateClient(...a),
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  unwrap: (x: unknown) => x,
}));
jest.mock('@/lib/toast', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const NOTE = { id: 'n-1', body: 'Old', kind: 'general', created_at: 'x' };

// Unmount so pending query notifications cannot fire after the suite ends.
const mounted: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((tree) => tree.unmount());
  });
});

function mountHook<T>(qc: QueryClient, useHook: () => T) {
  const ref = { current: null as unknown as T };
  function Probe() {
    ref.current = useHook();
    return null;
  }
  act(() => {
    mounted.push(
      renderer.create(
        <QueryClientProvider client={qc}>
          <Probe />
        </QueryClientProvider>,
      ),
    );
  });
  return ref;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => jest.clearAllMocks());

describe('client opt-in', () => {
  it('flips the profile at once and refetches only that client', async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.client('c-1'), { id: 'c-1', whatsapp_opt_in: true });
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    let release!: () => void;
    mockApi.updateClient.mockReturnValue(
      new Promise<void>((r) => (release = r)),
    );
    const ref = mountHook(qc, () => useUpdateClient('c-1'));
    await act(async () => {
      ref.current.mutate({ whatsapp_opt_in: false });
      await tick();
    });
    expect(
      qc.getQueryData<{ whatsapp_opt_in: boolean }>(qk.client('c-1')),
    ).toMatchObject({ whatsapp_opt_in: false });
    await act(async () => {
      release();
      await tick();
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.client('c-1') });
  });

  it('puts the switch back when the server refuses', async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.client('c-1'), { id: 'c-1', whatsapp_opt_in: true });
    mockApi.updateClient.mockRejectedValue(new Error('no'));
    const ref = mountHook(qc, () => useUpdateClient('c-1'));
    await act(async () => {
      ref.current.mutate({ whatsapp_opt_in: false });
      await tick();
      await tick();
    });
    expect(qc.getQueryData(qk.client('c-1'))).toMatchObject({
      whatsapp_opt_in: true,
    });
  });
});

describe('client notes', () => {
  it('shows a new note at once and hands the text back when it fails', async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.clientNotes('c-1'), [NOTE]);
    let fail!: (e: Error) => void;
    mockApi.addClientNote.mockReturnValue(
      new Promise((_, reject) => (fail = reject)),
    );
    const rejected = jest.fn();
    const ref = mountHook(qc, () => useAddClientNote('c-1', rejected));
    await act(async () => {
      ref.current.mutate({ body: 'Allergic to latex' });
      await tick();
    });
    expect(
      qc
        .getQueryData<{ body: string }[]>(qk.clientNotes('c-1'))
        ?.map((n) => n.body),
    ).toEqual(['Allergic to latex', 'Old']);
    await act(async () => {
      fail(new Error('no'));
      await tick();
      await tick();
    });
    expect(rejected).toHaveBeenCalledWith('Allergic to latex');
    expect(
      qc
        .getQueryData<{ body: string }[]>(qk.clientNotes('c-1'))
        ?.map((n) => n.body),
    ).toEqual(['Old']);
  });

  it('removes a deleted note at once', async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.clientNotes('c-1'), [NOTE]);
    mockApi.deleteClientNote.mockReturnValue(new Promise(() => undefined));
    const ref = mountHook(qc, () => useDeleteClientNote('c-1'));
    await act(async () => {
      ref.current.mutate('n-1');
      await Promise.resolve();
    });
    expect(qc.getQueryData(qk.clientNotes('c-1'))).toEqual([]);
  });
});

describe('useClientPreview', () => {
  it('reads name, phone and tags from the cached phone book', () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.clientBook, [
      {
        id: 'c-1',
        name: 'Amina',
        phone_e164: '+27821110001',
        tags: ['VIP'],
        appointments: [],
      },
    ]);
    const ref = mountHook(qc, () => useClientPreview('c-1'));
    expect(ref.current).toEqual({
      name: 'Amina',
      phone_e164: '+27821110001',
      tags: ['VIP'],
    });
    const none = mountHook(qc, () => useClientPreview('c-9'));
    expect(none.current).toBeNull();
  });
});
