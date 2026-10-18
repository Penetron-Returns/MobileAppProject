import { qk } from '@/lib/query';

export type RealtimeTable =
  | 'appointments'
  | 'attendance_checks'
  | 'business_hours'
  | 'business_special_days'
  | 'availability_rules'
  | 'availability_overrides'
  | 'staff_breaks'
  | 'staff_time_off'
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

/** Schedule configuration: any change moves the calendar's visible hours and what can be booked. */
const CONFIG_TABLES: RealtimeTable[] = [
  'business_hours',
  'business_special_days',
  'availability_rules',
  'availability_overrides',
  'staff_breaks',
  'staff_time_off',
];

const CONFIG_KEYS = [
  active(qk.availabilityConfig),
  active(qk.businessHours),
  active(qk.availabilityDays),
  active(qk.availabilitySlots),
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
  business_hours: CONFIG_KEYS,
  business_special_days: CONFIG_KEYS,
  availability_rules: CONFIG_KEYS,
  availability_overrides: CONFIG_KEYS,
  staff_breaks: CONFIG_KEYS,
  staff_time_off: CONFIG_KEYS,
  conversations: INBOX_KEYS,
  messages: INBOX_KEYS,
  escalations: INBOX_KEYS,
};

/** Own writes already refreshed these, so their echo is ignored; inbox traffic never is. */
const ECHOES_OF_OWN_WRITES = new Set<RealtimeTable>([
  'appointments',
  'attendance_checks',
  ...CONFIG_TABLES,
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
    ...CONFIG_TABLES,
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
