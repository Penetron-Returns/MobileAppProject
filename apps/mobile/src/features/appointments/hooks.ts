import type {
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  RescheduleAppointmentRequest,
  SetAppointmentStatusRequest,
} from '@booking/types';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { qk, useApiMutation, type MutationCallbacks } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

import { patchAppointment } from './optimistic';
import { detailFromListItem } from './placeholder';

const LIST_SELECT =
  'id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, status, source, price_cents, notes, checked_in_at, client_confirmed_at, client:clients(id, name, phone_e164), service:services(name), staff:staff(id, name)';

export async function fetchAppointmentsBetween(from: string, to: string) {
  return unwrap(
    await supabase
      .from('appointments')
      .select(LIST_SELECT)
      .gte('starts_at', from)
      .lt('starts_at', to)
      .neq('status', 'cancelled')
      .order('starts_at')
      .order('id'),
  );
}

export type AppointmentListItem = Awaited<
  ReturnType<typeof fetchAppointmentsBetween>
>[number];

export const appointmentsBetweenOptions = (from: string, to: string) => ({
  queryKey: qk.appointmentsRange(from, to),
  queryFn: () => fetchAppointmentsBetween(from, to),
});

/**
 * Non-cancelled appointments starting in [from, to) (ISO instants). With
 * `keepPrevious`, moving to another window keeps showing the last one (flagged
 * `isPlaceholderData`) instead of dropping to a loading state.
 */
export function useAppointmentsBetween(
  from: string,
  to: string,
  opts: { keepPrevious?: boolean } = {},
) {
  return useQuery({
    ...appointmentsBetweenOptions(from, to),
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });
}

async function fetchAppointment(id: string) {
  const res = await supabase
    .from('appointments')
    .select(
      'id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, status, source, price_cents, notes, checked_in_at, client_confirmed_at, created_at, client:clients(id, name, phone_e164, tags), service:services(name, category), staff:staff(name, photo_url)',
    )
    .eq('id', id)
    .maybeSingle();
  return unwrap<NonNullable<typeof res.data> | null>(res);
}

export type AppointmentDetail = NonNullable<
  Awaited<ReturnType<typeof fetchAppointment>>
>;

const appointmentOptions = (id: string) => ({
  queryKey: qk.appointment(id),
  queryFn: () => fetchAppointment(id),
});

const appointmentEventsOptions = (id: string) => ({
  queryKey: [...qk.appointment(id), 'events'] as const,
  queryFn: () => fetchAppointmentEvents(id),
});

/** One booking. While it loads, the row already in a calendar range is shown, so opening it is instant. */
export function useAppointment(id: string) {
  const qc = useQueryClient();
  return useQuery({
    ...appointmentOptions(id),
    placeholderData: () => {
      const lists = qc.getQueriesData<AppointmentListItem[]>({
        queryKey: [...qk.appointments, 'range'],
      });
      for (const [, rows] of lists) {
        const row = rows?.find((r) => r.id === id);
        if (row) return detailFromListItem(row);
      }
      return undefined;
    },
  });
}

/** Warms the detail and its history on touch-down, so the screen has them by the time it mounts. */
export function usePrefetchAppointment() {
  const qc = useQueryClient();
  return React.useCallback(
    (id: string) => {
      void qc.prefetchQuery({ ...appointmentOptions(id), staleTime: 30_000 });
      void qc.prefetchQuery({
        ...appointmentEventsOptions(id),
        staleTime: 30_000,
      });
    },
    [qc],
  );
}

const APPOINTMENT_KEYS = [qk.appointments, qk.clients];

export function useCheckInAppointment(opts: { onSuccess?: () => void } = {}) {
  return useApiMutation<string>({
    mutationFn: (id, key) => api.checkInAppointment(id, key),
    optimistic: (id, qc) =>
      patchAppointment(qc, id, {
        kind: 'checkIn',
        at: new Date().toISOString(),
      }),
    invalidate: APPOINTMENT_KEYS,
    onSuccess: opts.onSuccess,
  });
}

export function useCancelAppointment(opts: MutationCallbacks = {}) {
  return useApiMutation<{ id: string } & CancelAppointmentRequest>({
    mutationFn: ({ id, ...body }, key) => api.cancelAppointment(id, body, key),
    optimistic: ({ id }, qc) => patchAppointment(qc, id, { kind: 'cancel' }),
    invalidate: APPOINTMENT_KEYS,
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useCreateAppointment(
  opts: {
    onSuccess?: (appointmentId: string) => void;
    onError?: (error: unknown) => boolean | void;
  } = {},
) {
  return useApiMutation<CreateAppointmentRequest, { id: string }>({
    mutationFn: (body, key) => api.createAppointment(body, key),
    invalidate: APPOINTMENT_KEYS,
    onSuccess: (data) => opts.onSuccess?.(data.id),
    onError: opts.onError,
  });
}

/**
 * How long browsed availability may be reused. Only for browsing: the server
 * computes slots live and `create_appointment` re-validates at booking time.
 */
export const AVAILABILITY_STALE_MS = 20_000;

export interface SlotsQuery {
  serviceId: string | null;
  date: string | null;
  staffId: string | null;
}

export interface DaysQuery {
  serviceId: string | null;
  from: string | null;
  to: string | null;
  staffId: string | null;
}

export const availableSlotsOptions = (q: SlotsQuery) => ({
  queryKey: [...qk.availabilitySlots, q.serviceId, q.date, q.staffId] as const,
  queryFn: () =>
    api.availableSlots({
      service_id: q.serviceId ?? '',
      date: q.date ?? '',
      staff_id: q.staffId,
    }),
  staleTime: AVAILABILITY_STALE_MS,
});

export const availableDaysOptions = (q: DaysQuery) => ({
  queryKey: [
    ...qk.availabilityDays,
    q.serviceId,
    q.from,
    q.to,
    q.staffId,
  ] as const,
  queryFn: () =>
    api.availableDays({
      service_id: q.serviceId ?? '',
      from: q.from ?? '',
      to: q.to ?? '',
      staff_id: q.staffId,
    }),
  staleTime: AVAILABILITY_STALE_MS,
});

/**
 * Bookable slots for a day. Reused for ~20s while browsing; the previous
 * day's slots stay as a placeholder (`isPlaceholderData`) while the next load.
 */
export function useAvailableSlots(q: SlotsQuery) {
  return useQuery({
    ...availableSlotsOptions(q),
    enabled: Boolean(q.serviceId && q.date),
    placeholderData: keepPreviousData,
  });
}

/** Bookable days in [from, to] for a service (same freshness as slots). */
export function useAvailableDays(q: DaysQuery) {
  return useQuery({
    ...availableDaysOptions(q),
    enabled: Boolean(q.serviceId && q.from && q.to),
    placeholderData: keepPreviousData,
  });
}

/**
 * Warms the days for a chosen service, then the slots of its first bookable
 * day, so the "when" step opens with chips instead of a skeleton.
 */
export function usePrefetchAvailability() {
  const qc = useQueryClient();
  return React.useCallback(
    async (q: DaysQuery) => {
      const days = await qc
        .fetchQuery(availableDaysOptions(q))
        .catch(() => null);
      const first = days?.days[0];
      if (first) {
        void qc.prefetchQuery(
          availableSlotsOptions({
            serviceId: q.serviceId,
            date: first,
            staffId: q.staffId,
          }),
        );
      }
    },
    [qc],
  );
}

export function useRescheduleAppointment(
  opts: {
    onSuccess?: () => void;
    onError?: (e: unknown) => boolean | void;
  } = {},
) {
  return useApiMutation<{ id: string } & RescheduleAppointmentRequest>({
    mutationFn: ({ id, ...body }, key) =>
      api.rescheduleAppointment(id, body, key),
    optimistic: ({ id, starts_at }, qc) =>
      patchAppointment(qc, id, { kind: 'move', startsAt: starts_at }),
    invalidate: [
      ...APPOINTMENT_KEYS,
      qk.availabilitySlots,
      qk.availabilityDays,
    ],
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

/** Check-out is `completed`; no-show is the exception path. */
export function useSetAppointmentStatus(opts: { onSuccess?: () => void } = {}) {
  return useApiMutation<{ id: string } & SetAppointmentStatusRequest>({
    mutationFn: ({ id, ...body }, key) =>
      api.setAppointmentStatus(id, body, key),
    optimistic: ({ id, status }, qc) =>
      patchAppointment(qc, id, { kind: 'status', status }),
    invalidate: APPOINTMENT_KEYS,
    onSuccess: opts.onSuccess,
  });
}

async function fetchAppointmentEvents(id: string) {
  return unwrap(
    await supabase
      .from('appointment_events')
      .select('id, type, occurred_at')
      .eq('appointment_id', id)
      .order('occurred_at'),
  );
}

export type AppointmentEvent = Awaited<
  ReturnType<typeof fetchAppointmentEvents>
>[number];

export function useAppointmentEvents(id: string) {
  return useQuery(appointmentEventsOptions(id));
}

async function fetchBookingRules() {
  const res = await supabase
    .from('businesses')
    .select('booking_rules')
    .single();
  return unwrap<NonNullable<typeof res.data>>(res).booking_rules;
}

/** The business `booking_rules` JSON (parse with the pure helpers in bookings/logic). */
export function useBookingRules() {
  return useQuery({
    queryKey: [...qk.business, 'booking-rules'],
    queryFn: fetchBookingRules,
    staleTime: 5 * 60_000,
  });
}
