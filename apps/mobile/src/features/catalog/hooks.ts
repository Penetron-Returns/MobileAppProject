import type {
  CreateServiceRequest,
  CreateStaffRequest,
  UpdateServiceRequest,
  UpdateStaffRequest,
} from '@shared/api';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import type { MutationCallbacks } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

async function fetchServices() {
  return unwrap(
    await supabase
      .from('services')
      .select(
        'id, name, description, category, duration_minutes, price_cents, deposit_cents, is_active, sort_order',
      )
      .order('sort_order')
      .order('name'),
  );
}

export type ServiceRow = Awaited<ReturnType<typeof fetchServices>>[number];

export function useServices() {
  return useQuery({ queryKey: qk.services, queryFn: fetchServices });
}

async function fetchStaff() {
  return unwrap(
    await supabase
      .from('staff')
      .select(
        'id, user_id, name, title, photo_url, phone, email, color, is_active, accepts_bookings, sort_order',
      )
      .order('sort_order')
      .order('name'),
  );
}

export type StaffRow = Awaited<ReturnType<typeof fetchStaff>>[number];

export function useStaff() {
  return useQuery({ queryKey: qk.staff, queryFn: fetchStaff });
}

async function fetchStaffServices() {
  return unwrap(
    await supabase.from('staff_services').select('staff_id, service_id'),
  );
}

export function useStaffServices() {
  return useQuery({ queryKey: qk.staffServices, queryFn: fetchStaffServices });
}

export function useSaveService(opts: MutationCallbacks = {}) {
  return useApiMutation<
    { id: string | null; body: CreateServiceRequest | UpdateServiceRequest },
    unknown
  >({
    mutationFn: ({ id, body }, key) =>
      id
        ? api.updateService(id, body, key)
        : api.createService(body as CreateServiceRequest, key),
    invalidate: [qk.services, qk.staffServices],
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useDeleteService(opts: MutationCallbacks = {}) {
  return useApiMutation<string>({
    mutationFn: (id, key) => api.deleteService(id, key),
    invalidate: [qk.services, qk.staffServices],
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useSaveStaff(opts: MutationCallbacks = {}) {
  return useApiMutation<
    { id: string | null; body: CreateStaffRequest | UpdateStaffRequest },
    unknown
  >({
    mutationFn: ({ id, body }, key) =>
      id
        ? api.updateStaff(id, body, key)
        : api.createStaff(body as CreateStaffRequest, key),
    invalidate: [qk.staff, qk.staffServices],
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}

export function useDeleteStaff(opts: MutationCallbacks = {}) {
  return useApiMutation<string>({
    mutationFn: (id, key) => api.deleteStaff(id, key),
    invalidate: [qk.staff, qk.staffServices],
    onSuccess: opts.onSuccess,
    onError: opts.onError,
  });
}
