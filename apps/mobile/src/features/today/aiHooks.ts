import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { useBusiness, useBusinessHours } from '@/features/business/hooks';
import { useStaff } from '@/features/catalog/hooks';
import { useAvailabilityRules } from '@/features/team/hooks';
import { isFailed, loadError } from '@/lib/offline';
import { qk } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';
import { formatTime } from '@/lib/time';

import {
  bookableMinutes,
  bookedMinutes,
  bookedPercent,
  buildDigest,
  clovieBookedCount,
  nowRow,
  revenueSoFarCents,
  type AiAppointment,
  type AiEvent,
  type Digest,
  type NowRow,
} from './aiLogic';
import { useNow } from './hooks';
import { dayWindow, todayWindow, type TodayWindow } from './logic';

const APPOINTMENT_SELECT =
  'id, starts_at, ends_at, duration_minutes, status, checked_in_at, price_cents, source, client:clients(name, phone_e164), service:services(name), staff:staff(name)';
const EVENT_SELECT =
  'id, type, occurred_at, actor, appointment:appointments(starts_at, client:clients(name))';

/** Under `qk.appointments`, so the app-wide Realtime subscription refreshes both queries. */
const aiKey = (kind: 'appointments' | 'events', w: TodayWindow) =>
  [
    ...qk.appointments,
    'today-ai',
    kind,
    w.from.toISOString(),
    w.to.toISOString(),
  ] as const;

async function fetchAppointments(w: TodayWindow): Promise<AiAppointment[]> {
  return unwrap(
    await supabase
      .from('appointments')
      .select(APPOINTMENT_SELECT)
      .gte('starts_at', w.from.toISOString())
      .lt('starts_at', w.to.toISOString())
      .neq('status', 'cancelled')
      .order('starts_at')
      .order('id'),
  );
}

async function fetchEvents(w: TodayWindow): Promise<AiEvent[]> {
  return unwrap(
    await supabase
      .from('appointment_events')
      .select(EVENT_SELECT)
      .in('type', ['created', 'rescheduled', 'cancelled'])
      .gte('occurred_at', w.from.toISOString())
      .lt('occurred_at', w.to.toISOString())
      .order('occurred_at')
      .order('id'),
  );
}

export type TodayAiView =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | {
      status: 'ready';
      /** Business-local calendar date. */
      date: string;
      currency: string;
      timezone: string;
      now: Date;
      appointments: AiAppointment[];
      /** Whole percent of bookable time that is booked; null when nothing is bookable today. */
      percent: number | null;
      revenueCents: number;
      clovieBooked: number;
      digest: Digest;
      /** The now row's two lines, for the given companion activity. */
      nowRow: (isBusy: boolean) => NowRow;
      isOffline: boolean;
      lastUpdated: string | null;
      refresh: () => Promise<unknown>;
    };

/**
 * Everything the AI Today home shows, from RLS-scoped reads: today's
 * bookings, today's lifecycle events, business hours and each bookable
 * person's availability. Only the business and today's bookings gate the
 * screen; the digest and the ring degrade to empty when their reads fail.
 */
export function useTodayAi(): TodayAiView {
  const business = useBusiness();
  const now = useNow();
  const timezone = business.data?.timezone;
  const date = timezone ? todayWindow(now, timezone).date : null;
  const window = React.useMemo(
    () => (timezone && date ? dayWindow(date, timezone) : null),
    [timezone, date],
  );
  const idle = [...qk.appointments, 'today-ai', 'idle'] as const;
  const appointments = useQuery({
    queryKey: window ? aiKey('appointments', window) : idle,
    queryFn: () => fetchAppointments(window as TodayWindow),
    enabled: window !== null,
  });
  const events = useQuery({
    queryKey: window ? aiKey('events', window) : [...idle, 'events'],
    queryFn: () => fetchEvents(window as TodayWindow),
    enabled: window !== null,
  });
  const hours = useBusinessHours();
  const staff = useStaff();
  const rules = useAvailabilityRules();

  const { refetch: refetchBusiness } = business;
  const { refetch: refetchAppointments } = appointments;
  const { refetch: refetchEvents } = events;
  const refresh = React.useCallback(
    () =>
      Promise.all([refetchBusiness(), refetchAppointments(), refetchEvents()]),
    [refetchBusiness, refetchAppointments, refetchEvents],
  );

  const list = appointments.data;
  const staffIds = React.useMemo(
    () =>
      (staff.data ?? [])
        .filter((s) => s.is_active && s.accepts_bookings)
        .map((s) => s.id),
    [staff.data],
  );
  const digest = React.useMemo(
    () => buildDigest(events.data ?? [], date ?? '', timezone ?? 'UTC'),
    [events.data, date, timezone],
  );

  if (isFailed(business) && !business.data) {
    return {
      status: 'error',
      error: loadError(business),
      retry: () => void refetchBusiness(),
    };
  }
  if (!business.data || !date) return { status: 'loading' };
  if (isFailed(appointments) && list === undefined) {
    return {
      status: 'error',
      error: loadError(appointments),
      retry: () => void refetchAppointments(),
    };
  }
  if (list === undefined) return { status: 'loading' };

  const bookable = bookableMinutes({
    date,
    hours: hours.data ?? [],
    staffIds,
    rules: rules.data ?? [],
  });
  return {
    status: 'ready',
    date,
    currency: business.data.currency,
    timezone: business.data.timezone,
    now,
    appointments: list,
    percent: bookedPercent(bookedMinutes(list), bookable),
    revenueCents: revenueSoFarCents(list, now),
    clovieBooked: clovieBookedCount(list),
    digest,
    nowRow: (isBusy) =>
      nowRow({
        appointments: list,
        now,
        timezone: business.data.timezone,
        isBusy,
      }),
    isOffline: appointments.isError || appointments.fetchStatus === 'paused',
    lastUpdated: appointments.dataUpdatedAt
      ? formatTime(appointments.dataUpdatedAt, business.data.timezone)
      : null,
    refresh,
  };
}
