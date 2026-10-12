import type { CreateClientNoteRequest } from '@shared/api';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

import {
  clientSearchFilter,
  RECENT_DAYS,
  VIP_TAG,
  type ClientFilter,
} from './logic';

export const CLIENT_PAGE_SIZE = 20;
/** Recent appointments embedded per row, enough to find today's and the last visit. */
const EMBEDDED_APPOINTMENTS = 10;

async function fetchClientPage(
  filter: ClientFilter,
  search: string,
  page: number,
) {
  let query = supabase
    .from('clients')
    .select(
      'id, name, phone_e164, tags, last_seen_at, appointments(starts_at, status)',
    )
    .order('starts_at', { referencedTable: 'appointments', ascending: false })
    .limit(EMBEDDED_APPOINTMENTS, { referencedTable: 'appointments' });

  const or = clientSearchFilter(search);
  if (or) query = query.or(or);
  if (filter === 'vip') query = query.contains('tags', [VIP_TAG]);
  if (filter === 'recent') {
    const since = new Date(Date.now() - RECENT_DAYS * 86_400_000);
    query = query
      .gte('last_seen_at', since.toISOString())
      .order('last_seen_at', { ascending: false });
  }
  const from = page * CLIENT_PAGE_SIZE;
  return unwrap(
    await query
      .order('name', { nullsFirst: false })
      .order('id')
      .range(from, from + CLIENT_PAGE_SIZE - 1),
  );
}

export type ClientListItem = Awaited<
  ReturnType<typeof fetchClientPage>
>[number];

export function useClientList(filter: ClientFilter, search: string) {
  return useInfiniteQuery({
    queryKey: qk.clientList(filter, search.trim()),
    queryFn: ({ pageParam }) => fetchClientPage(filter, search, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === CLIENT_PAGE_SIZE ? pages.length : undefined,
  });
}

async function searchClients(search: string) {
  let query = supabase
    .from('clients')
    .select('id, name, phone_e164')
    .eq('is_blocked', false);
  const or = clientSearchFilter(search);
  if (or) query = query.or(or);
  return unwrap(
    await query
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(8),
  );
}

export type ClientOption = Awaited<ReturnType<typeof searchClients>>[number];

/** Small picker list for the add-booking form. */
export function useClientSearch(search: string) {
  return useQuery({
    queryKey: qk.clientSearch(search.trim()),
    queryFn: () => searchClients(search),
  });
}

async function fetchClient(id: string) {
  const res = await supabase
    .from('clients')
    .select('id, name, phone_e164, email, tags, first_seen_at, is_blocked')
    .eq('id', id)
    .maybeSingle();
  return unwrap<NonNullable<typeof res.data> | null>(res);
}

export type ClientProfile = NonNullable<
  Awaited<ReturnType<typeof fetchClient>>
>;

export function useClient(id: string) {
  return useQuery({
    queryKey: qk.client(id),
    queryFn: () => fetchClient(id),
    enabled: Boolean(id),
  });
}

async function fetchClientNotes(id: string) {
  return unwrap(
    await supabase
      .from('client_notes')
      .select('id, body, kind, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
  );
}

export type ClientNoteRow = Awaited<
  ReturnType<typeof fetchClientNotes>
>[number];

export function useClientNotes(id: string) {
  return useQuery({
    queryKey: qk.clientNotes(id),
    queryFn: () => fetchClientNotes(id),
  });
}

async function fetchClientAppointments(id: string) {
  return unwrap(
    await supabase
      .from('appointments')
      .select(
        'id, starts_at, duration_minutes, status, price_cents, service:services(name), staff:staff(name)',
      )
      .eq('client_id', id)
      .order('starts_at', { ascending: false }),
  );
}

export type ClientAppointment = Awaited<
  ReturnType<typeof fetchClientAppointments>
>[number];

export function useClientAppointments(id: string) {
  return useQuery({
    queryKey: qk.clientAppointments(id),
    queryFn: () => fetchClientAppointments(id),
  });
}

export function useAddClientNote(clientId: string) {
  return useApiMutation<CreateClientNoteRequest>({
    mutationFn: (body, key) => api.addClientNote(clientId, body, key),
    invalidate: [qk.clientNotes(clientId)],
  });
}
