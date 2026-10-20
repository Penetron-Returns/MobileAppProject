import type { QueryClient } from '@tanstack/react-query';

import { patchQueries, qk, type Rollback } from '@/lib/query';

/** What a status or time change does to a booking the owner can already see. */
export type AppointmentChange =
  | { kind: 'checkIn'; at: string }
  | { kind: 'status'; status: 'completed' | 'no_show' }
  | { kind: 'cancel' }
  | { kind: 'move'; startsAt: string };

interface Patchable {
  id: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  checked_in_at: string | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
}

const MINUTE_MS = 60_000;

/** The booking as it will look once the server has applied `change`. */
export function applyChange<T extends Patchable>(
  row: T,
  change: AppointmentChange,
): T {
  switch (change.kind) {
    case 'checkIn':
      return { ...row, checked_in_at: change.at };
    case 'status':
      return { ...row, status: change.status };
    case 'cancel':
      return { ...row, status: 'cancelled' };
    case 'move':
      return {
        ...row,
        starts_at: change.startsAt,
        ends_at: new Date(
          Date.parse(change.startsAt) + row.duration_minutes * MINUTE_MS,
        ).toISOString(),
      };
  }
}

/**
 * Calendar and list rows after the change. The lists never hold cancelled
 * bookings, so a cancel removes the row instead of marking it.
 */
export function patchRows<T extends Patchable>(
  rows: T[],
  id: string,
  change: AppointmentChange,
): T[] {
  if (!rows.some((r) => r.id === id)) return rows;
  if (change.kind === 'cancel') return rows.filter((r) => r.id !== id);
  return rows.map((r) => (r.id === id ? applyChange(r, change) : r));
}

/**
 * Shows the change in every cached calendar range and in the booking's own
 * detail, at once. Returns the rollback for a failed request; the mutation's
 * invalidation then refetches the truth either way.
 */
export function patchAppointment(
  qc: QueryClient,
  id: string,
  change: AppointmentChange,
): Rollback {
  const undoLists = patchQueries<Patchable[]>(
    qc,
    { queryKey: [...qk.appointments, 'range'] },
    (rows) => patchRows(rows, id, change),
  );
  const undoDetail = patchQueries<Patchable | null>(
    qc,
    { queryKey: qk.appointment(id), exact: true },
    (row) => (row ? applyChange(row, change) : row),
  );
  return () => {
    undoLists();
    undoDetail();
  };
}
