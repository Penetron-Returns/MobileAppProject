import { useQuery } from '@tanstack/react-query';

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

async function fetchDaySchedule(from: string, to: string) {
  return unwrap(
    await supabase
      .from('appointments')
      .select(
        'id, starts_at, duration_minutes, status, checked_in_at, client:clients(name, phone_e164), service:services(name)',
      )
      .gte('starts_at', from)
      .lt('starts_at', to)
      .neq('status', 'cancelled')
      .order('starts_at')
      .order('id'),
  );
}

export type ScheduleAppointment = Awaited<
  ReturnType<typeof fetchDaySchedule>
>[number];

/** Non-cancelled appointments starting on `date` in the business timezone. */
export function useDaySchedule(date: ISODate, timezone: string) {
  const range = dayRangeUtc(date, timezone);
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  return useQuery({
    queryKey: qk.appointmentsRange(from, to),
    queryFn: () => fetchDaySchedule(from, to),
  });
}
