import { QueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/query';

import {
  applyChange,
  patchAppointment,
  patchRows,
  type AppointmentChange,
} from '../optimistic';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'confirmed' as const,
  checked_in_at: null as string | null,
  starts_at: '2026-10-14T08:00:00.000Z',
  ends_at: '2026-10-14T09:00:00.000Z',
  duration_minutes: 60,
  ...over,
});

describe('applyChange', () => {
  it.each<[string, AppointmentChange, Record<string, unknown>]>([
    [
      'check-in stamps the arrival',
      { kind: 'checkIn', at: '2026-10-14T08:02:00.000Z' },
      { checked_in_at: '2026-10-14T08:02:00.000Z', status: 'confirmed' },
    ],
    [
      'check-out completes it',
      { kind: 'status', status: 'completed' },
      { status: 'completed' },
    ],
    [
      'no-show marks it',
      { kind: 'status', status: 'no_show' },
      { status: 'no_show' },
    ],
    [
      'cancel marks a detail cancelled',
      { kind: 'cancel' },
      { status: 'cancelled' },
    ],
    [
      'a move keeps the duration',
      { kind: 'move', startsAt: '2026-10-14T10:30:00.000Z' },
      {
        starts_at: '2026-10-14T10:30:00.000Z',
        ends_at: '2026-10-14T11:30:00.000Z',
      },
    ],
  ])('%s', (_name, change, expected) => {
    expect(applyChange(row('a'), change)).toMatchObject(expected);
  });
});

describe('patchRows', () => {
  it('changes only the matching row', () => {
    const rows = [row('a'), row('b')];
    const next = patchRows(rows, 'b', { kind: 'status', status: 'no_show' });
    expect(next[0]).toBe(rows[0]);
    expect(next[1].status).toBe('no_show');
  });
  it('drops a cancelled booking from a list', () => {
    expect(
      patchRows([row('a'), row('b')], 'a', { kind: 'cancel' }).map((r) => r.id),
    ).toEqual(['b']);
  });
  it('returns the same array when the booking is not in it', () => {
    const rows = [row('a')];
    expect(patchRows(rows, 'zzz', { kind: 'cancel' })).toBe(rows);
  });
});

describe('patchAppointment', () => {
  const rangeKey = qk.appointmentsRange('f', 't');

  function seeded() {
    const qc = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity } },
    });
    qc.setQueryData(rangeKey, [row('a'), row('b')]);
    qc.setQueryData(qk.appointment('a'), row('a'));
    qc.setQueryData([...qk.appointment('a'), 'events'], [{ id: 'e1' }]);
    return qc;
  }

  it('patches the calendar range and the detail, and leaves the history alone', () => {
    const qc = seeded();
    patchAppointment(qc, 'a', { kind: 'status', status: 'completed' });
    expect(
      (qc.getQueryData(rangeKey) as ReturnType<typeof row>[])[0].status,
    ).toBe('completed');
    expect(
      (qc.getQueryData(qk.appointment('a')) as { status: string }).status,
    ).toBe('completed');
    expect(qc.getQueryData([...qk.appointment('a'), 'events'])).toEqual([
      { id: 'e1' },
    ]);
  });

  it('restores the exact previous data on rollback', () => {
    const qc = seeded();
    const before = qc.getQueryData(rangeKey);
    const rollback = patchAppointment(qc, 'a', { kind: 'cancel' });
    expect(qc.getQueryData(rangeKey)).not.toBe(before);
    rollback();
    expect(qc.getQueryData(rangeKey)).toEqual(before);
    expect(
      (qc.getQueryData(qk.appointment('a')) as { status: string }).status,
    ).toBe('confirmed');
  });
});
