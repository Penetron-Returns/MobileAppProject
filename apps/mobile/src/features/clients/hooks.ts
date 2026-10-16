import type {
  CreateClientNoteRequest,
  UpdateClientRequest,
} from '@booking/types';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk, useApiMutation } from '@/lib/query';
import { supabase, unwrap } from '@/lib/supabase';

import { clientSearchFilter } from './logic';

/** Rows per request; PostgREST caps a response at 1,000 by default. */
const BOOK_PAGE_SIZE = 1000;
/** Safety stop on the phone book: 20,000 clients. */
const BOOK_MAX_PAGES = 20;
/** Newest bookings embedded per client, enough to find the last visit. */
const EMBEDDED_APPOINTMENTS = 6;

const BOOK_SELECT =
  'id, name, phone_e164, tags, appointments(starts_at, created_at, status, service:services(name))';

function bookPage(page: number) {
  const from = page * BOOK_PAGE_SIZE;
  return supabase
    .from('clients')
    .select(BOOK_SELECT)
    .neq('appointments.status', 'cancelled')
    .order('starts_at', { referencedTable: 'appointments', ascending: false })
    .limit(EMBEDDED_APPOINTMENTS, { referencedTable: 'appointments' })
    .order('id')
    .range(from, from + BOOK_PAGE_SIZE - 1);
}

/** Every client with their newest bookings: one query per 1,000 clients, no per-client calls. */
async function fetchClientBook() {
  const rows: NonNullable<Awaited<ReturnType<typeof bookPage>>['data']> = [];
  for (let page = 0; page < BOOK_MAX_PAGES; page += 1) {
    const batch = unwrap(await bookPage(page));
    rows.push(...batch);
    if (batch.length < BOOK_PAGE_SIZE) break;
  }
  return rows;
}

export type ClientBookItem = NonNullable<
  Awaited<ReturnType<typeof fetchClientBook>>
>[number];

/** The whole client list for the phone book (sectioned and searched on the device). */
export function useClientBook() {
  return useQuery({ queryKey: qk.clientBook, queryFn: fetchClientBook });
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
    .select(
      'id, name, phone_e164, email, tags, first_seen_at, is_blocked, whatsapp_opt_in',
    )
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

export function useDeleteClientNote(clientId: string) {
  return useApiMutation<string>({
    mutationFn: (noteId, key) => api.deleteClientNote(clientId, noteId, key),
    invalidate: [qk.clientNotes(clientId)],
  });
}

/** Opt a client in or out of WhatsApp messages. */
export function useUpdateClient(clientId: string) {
  return useApiMutation<UpdateClientRequest>({
    mutationFn: (body, key) => api.updateClient(clientId, body, key),
    invalidate: [qk.client(clientId), qk.clients],
  });
}
