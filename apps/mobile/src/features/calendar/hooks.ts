import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import {
  useAppointmentsBetween,
  type AppointmentListItem,
} from '@/features/appointments/hooks';
import { useBusiness, useBusinessHours } from '@/features/business/hooks';
import { useStaff, type StaffRow } from '@/features/catalog/hooks';
import { useNow } from '@/hooks/useNow';
import { supabase, unwrap } from '@/lib/supabase';
import { addDays, todayISO, zonedTimeToUtc, type ISODate } from '@/lib/time';

import { calendarKeys } from './keys';
import {
  buildDayColumns,
  weekDates,
  type DayColumn,
  type HoursRow,
  type MinuteSpan,
  type OverrideRow,
  type RuleRow,
} from './logic';

async function fetchRules(): Promise<RuleRow[]> {
  return unwrap(
    await supabase
      .from('availability_rules')
      .select('staff_id, weekday, start_time, end_time'),
  );
}

async function fetchOverrides(
  from: ISODate,
  to: ISODate,
): Promise<OverrideRow[]> {
  return unwrap(
    await supabase
      .from('availability_overrides')
      .select('staff_id, date, is_closed, start_time, end_time')
      .gte('date', from)
      .lte('date', to),
  );
}

export interface CalendarBase {
  timezone: string;
  today: ISODate;
  now: Date;
  hours: HoursRow[];
  overrides: OverrideRow[];
  appointments: AppointmentListItem[];
}

type Failed = { status: 'error'; error: unknown; retry: () => void };

/** Bookings, hours and overrides for [from, lastDay], shared by the day and week views. */
function useCalendarRange(from: ISODate, lastDay: ISODate) {
  const business = useBusiness();
  const now = useNow();
  const tz = business.data?.timezone ?? null;
  const fromIso = tz ? zonedTimeToUtc(from, '00:00', tz).toISOString() : '';
  const toIso = tz
    ? zonedTimeToUtc(addDays(lastDay, 1), '00:00', tz).toISOString()
    : '';
  const appointments = useAppointmentsBetween(fromIso, toIso);
  const hours = useBusinessHours();
  const overrides = useQuery({
    queryKey: calendarKeys.overrides(from, lastDay),
    queryFn: () => fetchOverrides(from, lastDay),
  });
  return { business, now, tz, appointments, hours, overrides };
}

const failure = (
  queries: { isError: boolean; error: unknown; refetch: () => unknown }[],
): Failed | null => {
  const failed = queries.find((q) => q.isError);
  return failed
    ? {
        status: 'error',
        error: failed.error,
        retry: () => queries.forEach((q) => void q.refetch()),
      }
    : null;
};

export type CalendarDayView =
  | { status: 'loading' }
  | Failed
  | {
      status: 'ready';
      timezone: string;
      today: ISODate;
      now: Date;
      columns: DayColumn<StaffRow, AppointmentListItem>[];
      window: MinuteSpan;
      isOffline: boolean;
      refresh: () => Promise<unknown>;
    };

export function useCalendarDay(date: ISODate): CalendarDayView {
  const range = useCalendarRange(date, date);
  const staff = useStaff();
  const rules = useQuery({
    queryKey: calendarKeys.rules,
    queryFn: fetchRules,
  });
  const { business, now, tz, appointments, hours, overrides } = range;

  const refresh = React.useCallback(
    () =>
      Promise.all([
        appointments.refetch(),
        overrides.refetch(),
        rules.refetch(),
        staff.refetch(),
      ]),
    [appointments, overrides, rules, staff],
  );

  const failed = failure(
    [business, appointments, hours, overrides, rules, staff].filter(
      (q) => q.isError && q.data === undefined,
    ),
  );
  if (failed) return failed;
  if (
    !tz ||
    !appointments.data ||
    !hours.data ||
    !overrides.data ||
    !rules.data ||
    !staff.data
  ) {
    return { status: 'loading' };
  }
  const { columns, window } = buildDayColumns({
    date,
    timezone: tz,
    staff: staff.data,
    appointments: appointments.data,
    hours: hours.data,
    rules: rules.data,
    overrides: overrides.data,
  });
  return {
    status: 'ready',
    timezone: tz,
    today: todayISO(tz, now),
    now,
    columns,
    window,
    isOffline: appointments.isError || appointments.fetchStatus === 'paused',
    refresh,
  };
}

export type CalendarWeekView =
  | { status: 'loading' }
  | Failed
  | (CalendarBase & {
      status: 'ready';
      staff: StaffRow[];
      isOffline: boolean;
      refresh: () => Promise<unknown>;
    });

export function useCalendarWeek(anchor: ISODate): CalendarWeekView {
  const dates = weekDates(anchor);
  const range = useCalendarRange(dates[0], dates[6]);
  const staff = useStaff();
  const { business, now, tz, appointments, hours, overrides } = range;
  const refresh = React.useCallback(
    () => Promise.all([appointments.refetch(), overrides.refetch()]),
    [appointments, overrides],
  );

  const failed = failure(
    [business, appointments, hours, overrides, staff].filter(
      (q) => q.isError && q.data === undefined,
    ),
  );
  if (failed) return failed;
  if (
    !tz ||
    !appointments.data ||
    !hours.data ||
    !overrides.data ||
    !staff.data
  ) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    timezone: tz,
    today: todayISO(tz, now),
    now,
    hours: hours.data,
    overrides: overrides.data,
    appointments: appointments.data,
    staff: staff.data.filter((s) => s.is_active),
    isOffline: appointments.isError || appointments.fetchStatus === 'paused',
    refresh,
  };
}
