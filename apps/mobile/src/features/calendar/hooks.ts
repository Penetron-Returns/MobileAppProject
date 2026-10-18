import type { AvailabilityConfigResponse } from '@booking/types';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';
import { AppState } from 'react-native';

import {
  appointmentsBetweenOptions,
  useAppointmentsBetween,
  type AppointmentListItem,
} from '@/features/appointments/hooks';
import { useBusiness } from '@/features/business/hooks';
import { useStaff, type StaffRow } from '@/features/catalog/hooks';
import { api } from '@/lib/api';
import { isFailed, loadError, type LoadStatus } from '@/lib/offline';
import { qk } from '@/lib/query';
import { addDays, todayISO, zonedTimeToUtc, type ISODate } from '@/lib/time';

import { toCalendarSchedule, type CalendarSchedule } from './config';
import {
  appointmentsOnDate,
  buildDayColumns,
  weekDates,
  type DayColumn,
  type MinuteSpan,
  type SpecialDayRow,
} from './logic';

export interface CalendarBase {
  timezone: string;
  today: ISODate;
  schedule: CalendarSchedule;
  appointments: AppointmentListItem[];
}

type Failed = { status: 'error'; error: unknown; retry: () => void };

/** How long a neighbouring week fetched ahead of time is reused. */
const PREFETCH_STALE_MS = 30_000;

const configOptions = (from: ISODate, to: ISODate) => ({
  queryKey: qk.availabilityConfigRange(from, to),
  queryFn: (): Promise<AvailabilityConfigResponse> =>
    api.availabilityConfig({ from, to }),
});

const windowIso = (from: ISODate, lastDay: ISODate, tz: string) => ({
  from: zonedTimeToUtc(from, '00:00', tz).toISOString(),
  to: zonedTimeToUtc(addDays(lastDay, 1), '00:00', tz).toISOString(),
});

/** The business's today, re-checked each minute; it re-renders only when the date actually turns over. */
export function useToday(tz: string | null): ISODate | null {
  const [today, setToday] = React.useState<ISODate | null>(() =>
    tz ? todayISO(tz) : null,
  );
  React.useEffect(() => {
    if (!tz) return;
    const sync = () => setToday(todayISO(tz));
    sync();
    const id = setInterval(sync, 60_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [tz]);
  return today;
}

/**
 * Bookings and the schedule (hours, special days, breaks, time off) for the
 * whole Monday-to-Sunday week around `anchor`. A day is derived from its week,
 * so paging between days of one week never fetches. Moving to another week keeps
 * the last one on screen (`settled` false) while the next loads, and the
 * neighbouring weeks are fetched ahead.
 */
function useCalendarWeekData(anchor: ISODate) {
  const business = useBusiness();
  const qc = useQueryClient();
  const tz = business.data?.timezone ?? null;
  const dates = React.useMemo(() => weekDates(anchor), [anchor]);
  const first = dates[0];
  const last = dates[6];
  const iso = React.useMemo(
    () => (tz ? windowIso(first, last, tz) : { from: '', to: '' }),
    [tz, first, last],
  );
  const appointments = useAppointmentsBetween(iso.from, iso.to, {
    keepPrevious: true,
  });
  const config = useQuery({
    ...configOptions(first, last),
    placeholderData: keepPreviousData,
  });
  const settled = !appointments.isPlaceholderData && !config.isPlaceholderData;
  const ready = settled && appointments.isSuccess && config.isSuccess;

  React.useEffect(() => {
    if (!tz || !ready) return;
    for (const shift of [-7, 7]) {
      const from = addDays(first, shift);
      const to = addDays(last, shift);
      const w = windowIso(from, to, tz);
      void qc.prefetchQuery({
        ...appointmentsBetweenOptions(w.from, w.to),
        staleTime: PREFETCH_STALE_MS,
      });
      void qc.prefetchQuery({
        ...configOptions(from, to),
        staleTime: PREFETCH_STALE_MS,
      });
    }
  }, [qc, tz, ready, first, last]);

  return { business, tz, appointments, config, settled };
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
      /** The day the grid shows; trails the requested date until that week has loaded. */
      date: ISODate;
      timezone: string;
      today: ISODate;
      columns: DayColumn<StaffRow, AppointmentListItem>[];
      window: MinuteSpan;
      /** The holiday this date is closed for, if any. */
      closedDay: SpecialDayRow | null;
      isOffline: boolean;
      /** Another week is loading behind the grid: show a thin indicator, not a skeleton. */
      isRefreshing: boolean;
      refresh: () => Promise<unknown>;
    };

export function useCalendarDay(date: ISODate): CalendarDayView {
  const { business, tz, appointments, config, settled } =
    useCalendarWeekData(date);
  const staff = useStaff();
  const today = useToday(tz);

  // The day on screen only moves once its week's data is in, so the grid never
  // shows a day with another week's bookings (or none).
  const shown = React.useRef(date);
  if (settled) shown.current = date;
  const shownDate = shown.current;

  const refetchAppointments = appointments.refetch;
  const refetchConfig = config.refetch;
  const refetchStaff = staff.refetch;
  const refresh = React.useCallback(
    () => Promise.all([refetchAppointments(), refetchConfig(), refetchStaff()]),
    [refetchAppointments, refetchConfig, refetchStaff],
  );

  const built = React.useMemo(() => {
    if (!tz || !appointments.data || !config.data || !staff.data) return null;
    return buildDayColumns({
      date: shownDate,
      timezone: tz,
      staff: staff.data,
      appointments: appointmentsOnDate(appointments.data, shownDate, tz),
      schedule: toCalendarSchedule(config.data),
    });
  }, [tz, shownDate, appointments.data, config.data, staff.data]);

  const failed = failure(
    [business, appointments, config, staff].filter(
      (q) => isFailed(q) && q.data === undefined,
    ),
  );
  if (failed) return failed;
  if (!tz || !today || !built) return { status: 'loading' };
  return {
    status: 'ready',
    date: shownDate,
    timezone: tz,
    today,
    ...built,
    isOffline: appointments.isError || appointments.fetchStatus === 'paused',
    isRefreshing: !settled,
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
      isRefreshing: boolean;
      refresh: () => Promise<unknown>;
    });

export function useCalendarWeek(anchor: ISODate): CalendarWeekView {
  const { business, tz, appointments, config, settled } =
    useCalendarWeekData(anchor);
  const staff = useStaff();
  const today = useToday(tz);
  const refetchAppointments = appointments.refetch;
  const refetchConfig = config.refetch;
  const refetchStaff = staff.refetch;
  const refresh = React.useCallback(
    () => Promise.all([refetchAppointments(), refetchConfig(), refetchStaff()]),
    [refetchAppointments, refetchConfig, refetchStaff],
  );
  const schedule = React.useMemo(
    () => (config.data ? toCalendarSchedule(config.data) : null),
    [config.data],
  );
  const activeStaff = React.useMemo(
    () => staff.data?.filter((s) => s.is_active) ?? null,
    [staff.data],
  );

  const failed = failure(
    [business, appointments, config, staff].filter(
      (q) => isFailed(q) && q.data === undefined,
    ),
  );
  if (failed) return failed;
  if (!tz || !today || !appointments.data || !schedule || !activeStaff) {
    return { status: 'loading' };
  }
  return {
    status: 'ready',
    timezone: tz,
    today,
    schedule,
    appointments: appointments.data,
    staff: activeStaff,
    isOffline: appointments.isError || appointments.fetchStatus === 'paused',
    isRefreshing: !settled,
    refresh,
  };
}
