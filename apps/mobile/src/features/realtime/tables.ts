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

/** The query keys a change to each table makes stale. */
const KEYS: Record<RealtimeTable, readonly (readonly unknown[])[]> = {
  appointments: [qk.appointments, qk.dashboardAll, qk.clients],
  attendance_checks: [qk.attendance],
  conversations: [qk.conversations, ['messages'], ['escalations']],
  messages: [qk.conversations, ['messages'], ['escalations']],
  escalations: [qk.conversations, ['messages'], ['escalations']],
};

/** Tables to listen to: always bookings and attendance, the inbox ones only when the plan has an inbox. */
export function realtimeTables(hasInbox: boolean): RealtimeTable[] {
  return [
    'appointments',
    'attendance_checks',
    ...(hasInbox ? INBOX_TABLES : []),
  ];
}

export function keysToInvalidate(table: RealtimeTable) {
  return KEYS[table];
}

/** Whether the live channel should exist: signed in to a business and the app not backgrounded. */
export function shouldListen(isEnabled: boolean, appState: string): boolean {
  return isEnabled && appState !== 'background';
}
