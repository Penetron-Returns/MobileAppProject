import type {
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  RescheduleAppointmentRequest,
  SetAppointmentStatusRequest,
} from '@booking/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

/** Refetches every appointment-derived query when an appointment changes. */
export function useAppointmentsRealtime(enabled: boolean) {
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          void queryClient.invalidateQueries({ queryKey: qk.appointments });
          void queryClient.invalidateQueries({ queryKey: qk.dashboardAll });
          void queryClient.invalidateQueries({ queryKey: qk.clients });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);
}

const LIST_SELECT =
  'id, starts_at, ends_at, duration_minutes, status, checked_in_at, client:clients(id, name, phone_e164), service:services(name), staff:staff(id, name)';

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

/** Non-cancelled appointments starting in [from, to) (ISO instants). */
export function useAppointmentsBetween(from: string, to: string) {
  return useQuery({
    queryKey: qk.appointmentsRange(from, to),
    queryFn: () => fetchAppointmentsBetween(from, to),
  });
}

async function fetchAppointment(id: string) {
  const res = await supabase
    .from('appointments')
    .select(
      'id, client_id, service_id, staff_id, starts_at, ends_at, duration_minutes, status, source, price_cents, notes, checked_in_at, created_at, client:clients(id, name, phone_e164, tags), service:services(name, category), staff:staff(name, photo_url)',
    )
    .eq('id', id)
    .maybeSingle();
  return unwrap<NonNullable<typeof res.data> | null>(res);
}

export type AppointmentDetail = NonNullable<
  Awaited<ReturnType<typeof fetchAppointment>>
>;

export function useAppointment(id: string) {
  return useQuery({
    queryKey: qk.appointment(id),
    queryFn: () => fetchAppointment(id),
  });
}

const APPOINTMENT_KEYS = [qk.appointments, qk.dashboardAll, qk.clients];

export function useCheckInAppointment(opts: { onSuccess?: () => void } = {}) {
  return useApiMutation<string>({
    mutationFn: (id, key) => api.checkInAppointment(id, key),
    invalidate: APPOINTMENT_KEYS,
    onSuccess: opts.onSuccess,
  });
}

export function useCancelAppointment(opts: { onSuccess?: () => void } = {}) {
  return useApiMutation<{ id: string } & CancelAppointmentRequest>({
    mutationFn: ({ id, ...body }, key) => api.cancelAppointment(id, body, key),
    invalidate: APPOINTMENT_KEYS,
    onSuccess: opts.onSuccess,
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

/** Live bookable slots; never served from cache (BUILD_PLAN rule 5). */
export function useAvailableSlots(q: {
  serviceId: string | null;
  date: string | null;
  staffId: string | null;
}) {
  return useQuery({
    queryKey: [...qk.availabilitySlots, q.serviceId, q.date, q.staffId],
    queryFn: () =>
      api.availableSlots({
        service_id: q.serviceId ?? '',
        date: q.date ?? '',
        staff_id: q.staffId,
      }),
    enabled: Boolean(q.serviceId && q.date),
    staleTime: 0,
    gcTime: 0,
  });
}

/** Bookable days in [from, to] for a service (live, like slots). */
export function useAvailableDays(q: {
  serviceId: string | null;
  from: string | null;
  to: string | null;
  staffId: string | null;
}) {
  return useQuery({
    queryKey: [...qk.availabilityDays, q.serviceId, q.from, q.to, q.staffId],
    queryFn: () =>
      api.availableDays({
        service_id: q.serviceId ?? '',
        from: q.from ?? '',
        to: q.to ?? '',
        staff_id: q.staffId,
      }),
    enabled: Boolean(q.serviceId && q.from && q.to),
    staleTime: 0,
    gcTime: 0,
  });
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
  return useQuery({
    queryKey: [...qk.appointment(id), 'events'],
    queryFn: () => fetchAppointmentEvents(id),
  });
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
