import { qk } from '@/lib/query';

export type RealtimeTable =
  | 'appointments'
  | 'attendance_checks'
  | 'conversations'
  | 'messages'
  | 'escalations';

const INBOX_TABLES: RealtimeTable[] = [
  'conversations',
  'messages',
  'escalations',
];

export interface Invalidation {
  key: readonly unknown[];
  /** `none` only marks stale: the next screen that reads it refetches. */
  refetchType: 'active' | 'none';
}

const active = (key: readonly unknown[]): Invalidation => ({
  key,
  refetchType: 'active',
});

const INBOX_KEYS = [
  active(qk.conversations),
  active(['messages']),
  active(['escalations']),
];

/** The query keys a change to each table makes stale. */
const KEYS: Record<RealtimeTable, readonly Invalidation[]> = {
  appointments: [
    active(qk.appointments),
    active(qk.dashboardAll),
    // The book only shows last-visit hints: refresh it when next opened.
    { key: qk.clientBook, refetchType: 'none' },
  ],
  attendance_checks: [active(qk.attendance)],
  conversations: INBOX_KEYS,
  messages: INBOX_KEYS,
  escalations: INBOX_KEYS,
};

/** Own writes already refreshed these, so their echo is ignored; inbox traffic never is. */
const ECHOES_OF_OWN_WRITES = new Set<RealtimeTable>([
  'appointments',
  'attendance_checks',
]);

export function isEchoCandidate(table: RealtimeTable): boolean {
  return ECHOES_OF_OWN_WRITES.has(table);
}

/** Quiet period that coalesces a burst of row events into one refresh. */
export const REALTIME_DEBOUNCE_MS = 300;

/** Tables to listen to: always bookings and attendance, the inbox ones only when the plan has an inbox. */
export function realtimeTables(hasInbox: boolean): RealtimeTable[] {
  return [
    'appointments',
    'attendance_checks',
    ...(hasInbox ? INBOX_TABLES : []),
  ];
}

export function keysToInvalidate(
  table: RealtimeTable,
): readonly Invalidation[] {
  return KEYS[table];
}

/** Whether the live channel should exist: signed in to a business and the app not backgrounded. */
export function shouldListen(isEnabled: boolean, appState: string): boolean {
  return isEnabled && appState !== 'background';
}
