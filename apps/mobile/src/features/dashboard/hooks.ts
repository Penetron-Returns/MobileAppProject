import { useQuery } from '@tanstack/react-query';

import {
  useAppointmentsBetween,
  type AppointmentListItem,
} from '@/features/appointments/hooks';
import { qk } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';
import { dayRangeUtc, type ISODate } from '@/lib/time';

import { parseDashboardSummary } from './logic';

export function useDashboardSummary(date: ISODate) {
  return useQuery({
    queryKey: qk.dashboard(date),
    queryFn: async () =>
      parseDashboardSummary(
        unwrap(await supabase.rpc('dashboard_summary', { p_date: date })),
      ),
  });
}

export type ScheduleAppointment = AppointmentListItem;

/** Non-cancelled appointments starting on `date` in the business timezone. */
export function useDaySchedule(date: ISODate, timezone: string) {
  const range = dayRangeUtc(date, timezone);
  // Shares the calendar's query (and cache entry) for the same day.
  return useAppointmentsBetween(
    range.from.toISOString(),
    range.to.toISOString(),
  );
}
