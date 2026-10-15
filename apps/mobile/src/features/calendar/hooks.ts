import * as React from 'react';

import {
  useAppointmentsBetween,
  type AppointmentListItem,
} from '@/features/appointments/hooks';
import { useAvailabilityConfig } from '@/features/availability/hooks';
import { useBusiness } from '@/features/business/hooks';
import { useStaff, type StaffRow } from '@/features/catalog/hooks';
import { useNow } from '@/hooks/useNow';
import { isFailed, loadError, type LoadStatus } from '@/lib/offline';
import { addDays, todayISO, zonedTimeToUtc, type ISODate } from '@/lib/time';

import { toCalendarSchedule, type CalendarSchedule } from './config';
import {
  buildDayColumns,
  weekDates,
  type DayColumn,
  type MinuteSpan,
  type SpecialDayRow,
} from './logic';

export interface CalendarBase {
  timezone: string;
  today: ISODate;
  now: Date;
  schedule: CalendarSchedule;
  appointments: AppointmentListItem[];
}

type Failed = { status: 'error'; error: unknown; retry: () => void };

/** Bookings and the schedule (hours, special days, breaks, time off) for [from, lastDay]. */
function useCalendarRange(from: ISODate, lastDay: ISODate) {
  const business = useBusiness();
  const now = useNow();
  const tz = business.data?.timezone ?? null;
  const fromIso = tz ? zonedTimeToUtc(from, '00:00', tz).toISOString() : '';
  const toIso = tz
    ? zonedTimeToUtc(addDays(lastDay, 1), '00:00', tz).toISOString()
    : '';
  const appointments = useAppointmentsBetween(fromIso, toIso);
  const config = useAvailabilityConfig(from, lastDay);
  return { business, now, tz, appointments, config };
}

const failure = (
  queries: (LoadStatus & { refetch: () => unknown })[],
): Failed | null => {
  const failed = queries.find(isFailed);
  return failed
    ? {
        status: 'error',
        error: loadError(failed),
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
      /** The holiday this date is closed for, if any. */
      closedDay: SpecialDayRow | null;
      isOffline: boolean;
      refresh: () => Promise<unknown>;
    };

export function useCalendarDay(date: ISODate): CalendarDayView {
  const { business, now, tz, appointments, config } = useCalendarRange(
    date,
    date,
  );
  const staff = useStaff();

  const refresh = React.useCallback(
    () =>
      Promise.all([appointments.refetch(), config.refetch(), staff.refetch()]),
    [appointments, config, staff],
  );

  const failed = failure(
    [business, appointments, config, staff].filter(
      (q) => isFailed(q) && q.data === undefined,
    ),
  );
  if (failed) return failed;
  if (!tz || !appointments.data || !config.data || !staff.data) {
    return { status: 'loading' };
  }
  const { columns, window, closedDay } = buildDayColumns({
    date,
    timezone: tz,
    staff: staff.data,
    appointments: appointments.data,
    schedule: toCalendarSchedule(config.data),
  });
  return {
    status: 'ready',
    timezone: tz,
    today: todayISO(tz, now),
    now,
    columns,
    window,
    closedDay,
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
  const { business, now, tz, appointments, config } = useCalendarRange(
    dates[0],
    dates[6],
  );
  const staff = useStaff();
  const refresh = React.useCallback(
    () => Promise.all([appointments.refetch(), config.refetch()]),
    [appointments, config],
  );

  const failed = failure(
    [business, appointments, config, staff].filter(
      (q) => isFailed(q) && q.data === undefined,
    ),
  );
  if (failed) return failed;
  if (!tz || !appointments.data || !config.data || !staff.data) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    timezone: tz,
    today: todayISO(tz, now),
    now,
    schedule: toCalendarSchedule(config.data),
    appointments: appointments.data,
    staff: staff.data.filter((s) => s.is_active),
    isOffline: appointments.isError || appointments.fetchStatus === 'paused',
    refresh,
  };
}
