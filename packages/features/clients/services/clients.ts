/**
 * Client operations behind /v1/clients, the public web booking and the
 * Nerova connector. Every function takes the caller's business id.
 */
import type {
  ClientDTO,
  ClientNoteDTO,
  CreateClientNoteRequest,
  CreateClientRequest,
  UpdateClientRequest,
  UUID,
} from '@booking/types';
import { notFound } from '../../lib/errors.ts';
import { normalizePhone } from '../../lib/phone.ts';
import { pick } from '../../lib/pick.ts';
import { toClientDTO, toClientNoteDTO } from '../../bookings/lib/mappers.ts';
import type { ClientPatch } from '../../repositories/types.ts';
import type { BookingRepository } from '../../repositories/types.ts';

/**
 * Upsert by phone via RPC upsert_client_by_phone, then apply the provided
 * fields. `onlyFillBlank` (public web booking) never overwrites existing data.
 */
export async function upsertClient(
  repo: BookingRepository,
  businessId: UUID,
  req: CreateClientRequest,
  opts: { onlyFillBlank?: boolean } = {},
): Promise<ClientDTO> {
  const phone = normalizePhone(req.phone);
  const row = await repo.upsertClientByPhone(businessId, phone, req.name ?? null);
  const wanted: ClientPatch = pick(req, ['name', 'email', 'notes', 'tags'] as const);
  const patch: ClientPatch = opts.onlyFillBlank
    ? Object.fromEntries(Object.entries(wanted).filter(([k]) => row[k as keyof ClientPatch] === null))
    : wanted;
  const changed = Object.entries(patch).some(
    ([k, v]) => JSON.stringify(row[k as keyof ClientPatch]) !== JSON.stringify(v),
  );
  if (!changed) return toClientDTO(row);
  const updated = await repo.updateClient(businessId, row.id, patch);
  if (!updated) throw notFound('Client');
  return toClientDTO(updated);
}

export async function updateClient(
  repo: BookingRepository,
  businessId: UUID,
  clientId: UUID,
  req: UpdateClientRequest,
): Promise<ClientDTO> {
  const patch: ClientPatch = pick(req, ['name', 'email', 'notes', 'tags', 'is_blocked', 'whatsapp_opt_in'] as const);
  if (req.phone !== undefined) patch.phone_e164 = normalizePhone(req.phone);
  const row = Object.keys(patch).length
    ? await repo.updateClient(businessId, clientId, patch)
    : await repo.getClient(businessId, clientId);
  if (!row) throw notFound('Client');
  return toClientDTO(row);
}

export async function addClientNote(
  repo: BookingRepository,
  businessId: UUID,
  clientId: UUID,
  userId: string,
  req: CreateClientNoteRequest,
): Promise<ClientNoteDTO> {
  if (!(await repo.getClient(businessId, clientId))) throw notFound('Client');
  const row = await repo.insertClientNote(businessId, {
    client_id: clientId,
    body: req.body,
    kind: req.kind ?? 'general',
    created_by: userId,
  });
  return toClientNoteDTO(row);
}

export async function deleteClientNote(
  repo: BookingRepository,
  businessId: UUID,
  clientId: UUID,
  noteId: UUID,
): Promise<{ id: UUID }> {
  if (!(await repo.deleteClientNote(businessId, clientId, noteId))) throw notFound('Client note');
  return { id: noteId };
}
