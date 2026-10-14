import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { useBusiness, useWhatsAppAccount } from '@/features/business/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { qk } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';
import { formatTime } from '@/lib/time';

import {
  dayWindow,
  expectedTotalCents,
  formatDayCaption,
  selectLaterToday,
  selectUpNext,
  todayWindow,
  type LaterToday,
  type TodayAppointment,
  type TodayWindow,
} from './logic';

const TODAY_SELECT =
  'id, starts_at, ends_at, duration_minutes, status, checked_in_at, price_cents, client:clients(name, phone_e164), service:services(name), staff:staff(name)';

/** Under `qk.appointments`, so the app-wide Realtime subscription refreshes it. */
export const todayKey = (window: Pick<TodayWindow, 'from' | 'to'>) =>
  [
    ...qk.appointments,
    'today',
    window.from.toISOString(),
    window.to.toISOString(),
  ] as const;

async function fetchToday(window: TodayWindow): Promise<TodayAppointment[]> {
  return unwrap(
    await supabase
      .from('appointments')
      .select(TODAY_SELECT)
      .gte('starts_at', window.from.toISOString())
      .lt('starts_at', window.to.toISOString())
      .neq('status', 'cancelled')
      .order('starts_at')
      .order('id'),
  );
}

/** A clock that re-renders every `intervalMs`, so "in 20 min" stays true. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type TodayView =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | {
      status: 'ready';
      caption: string;
      currency: string;
      timezone: string;
      now: Date;
      appointments: TodayAppointment[];
      upNext: TodayAppointment | null;
      later: LaterToday;
      expectedCents: number;
      /** Showing saved data because the latest refresh failed or is paused. */
      isOffline: boolean;
      lastUpdated: string | null;
      refresh: () => Promise<unknown>;
    };

/** Everything the Today screen renders: business, today's bookings and the derived summary. */
export function useToday(): TodayView {
  const business = useBusiness();
  const now = useNow();
  const timezone = business.data?.timezone;
  const date = timezone ? todayWindow(now, timezone).date : null;
  // Re-derive the window only when the business-local date changes.
  const window = React.useMemo(
    () => (timezone && date ? dayWindow(date, timezone) : null),
    [timezone, date],
  );
  const appointments = useQuery({
    queryKey: window ? todayKey(window) : [...qk.appointments, 'today', 'idle'],
    queryFn: () => fetchToday(window as TodayWindow),
    enabled: window !== null,
  });

  const { refetch: refetchBusiness } = business;
  const { refetch: refetchAppointments } = appointments;
  const refresh = React.useCallback(
    () => Promise.all([refetchBusiness(), refetchAppointments()]),
    [refetchBusiness, refetchAppointments],
  );

  if (isFailed(business) && !business.data) {
    return {
      status: 'error',
      error: loadError(business),
      retry: () => void refetchBusiness(),
    };
  }
  if (!business.data || !date) return { status: 'loading' };
  if (isFailed(appointments) && appointments.data === undefined) {
    return {
      status: 'error',
      error: loadError(appointments),
      retry: () => void refetchAppointments(),
    };
  }
  if (appointments.data === undefined) return { status: 'loading' };

  const list = appointments.data;
  return {
    status: 'ready',
    caption: formatDayCaption(date),
    currency: business.data.currency,
    timezone: business.data.timezone,
    now,
    appointments: list,
    upNext: selectUpNext(list, now),
    later: selectLaterToday(list, now),
    expectedCents: expectedTotalCents(list),
    isOffline: appointments.isError || appointments.fetchStatus === 'paused',
    lastUpdated: appointments.dataUpdatedAt
      ? formatTime(appointments.dataUpdatedAt, business.data.timezone)
      : null,
    refresh,
  };
}

/** `wa.me/<number>` for the business's connected WhatsApp, or null when none is connected. */
export function useBookingLink(): string | null {
  const account = useWhatsAppAccount();
  const digits = account.data?.display_phone?.replace(/\D/g, '');
  return digits ? `wa.me/${digits}` : null;
}
