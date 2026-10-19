import type { CheckInCandidate } from '../checkIn';

/** An appointment as instant answers read it: the check-in fields plus whatever the loader had for free. */
export interface InstantAppointment extends CheckInCandidate {
  staff_id?: string | null;
  staff?: { name: string | null } | null;
  service?: { name: string | null } | null;
}

/** Today's bookings in the business timezone, as already loaded by the app. */
export interface InstantData {
  appointments: readonly InstantAppointment[];
  timezone: string;
}

/** A time as spoken, before it is pinned to today (see `resolveSpokenTime`). */
export type SpokenTime =
  | { kind: 'now' }
  | {
      kind: 'clock';
      /** 0-23 as said ("3" is 3, "15" is 15) */
      hour: number;
      /** Minutes after the hour, -59..59 (negative for "quarter to") */
      minute: number;
      /** Said or implied ("this afternoon") am or pm; absent for a bare 1-12 */
      meridiem?: 'am' | 'pm';
    };

export type InstantIntent =
  | { kind: 'next' }
  | { kind: 'count' }
  | { kind: 'edge'; which: 'first' | 'last' }
  | { kind: 'free_at'; time: SpokenTime; staff?: string }
  | { kind: 'client_time'; name: string };

export type InstantIntentKind = InstantIntent['kind'];
