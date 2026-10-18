import '@/lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import renderer, { act } from 'react-test-renderer';

import { qk } from '@/lib/query';

import { useSaveBookingRules } from '../hooks';

const mockUpdate = jest.fn();
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  api: { updateBusiness: (...a: unknown[]) => mockUpdate(...a) },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  unwrap: (x: unknown) => x,
}));
jest.mock('@/lib/toast', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const KEY = [...qk.business, 'rules'];
const tick = () => new Promise((r) => setTimeout(r, 0));

function mount(qc: QueryClient) {
  const ref = {
    current: null as unknown as ReturnType<typeof useSaveBookingRules>,
  };
  function Probe() {
    ref.current = useSaveBookingRules();
    return null;
  }
  act(() => {
    renderer.create(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return ref;
}

describe('useSaveBookingRules', () => {
  it('shows the new rule at once and keeps the others', async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, { allow_staff_selection: true, buffer_minutes: 10 });
    mockUpdate.mockReturnValue(new Promise(() => undefined));
    const ref = mount(qc);
    await act(async () => {
      ref.current.mutate({ booking_rules: { allow_staff_selection: false } });
      await tick();
    });
    expect(qc.getQueryData(KEY)).toEqual({
      allow_staff_selection: false,
      buffer_minutes: 10,
    });
  });

  it('puts the old value back when the save fails', async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, { buffer_minutes: 10 });
    let fail!: (e: Error) => void;
    mockUpdate.mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const ref = mount(qc);
    await act(async () => {
      ref.current.mutate({ booking_rules: { buffer_minutes: 30 } });
      await tick();
    });
    expect(qc.getQueryData(KEY)).toEqual({ buffer_minutes: 30 });
    await act(async () => {
      fail(new Error('no'));
      await tick();
      await tick();
    });
    expect(qc.getQueryData(KEY)).toEqual({ buffer_minutes: 10 });
  });
});
