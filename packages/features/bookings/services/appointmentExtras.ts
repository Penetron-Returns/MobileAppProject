/** Appointment operations that involve no availability (status, check-in, notes). */
import type { AppointmentDTO, UUID } from '@booking/types';
import { notFound } from '../../lib/errors.ts';
import type { Actor } from '../../ports.ts';
import type { BookingRepository } from '../../repositories/types.ts';
import { toAppointmentDTO } from '../lib/mappers.ts';

async function requireAppointment(repo: BookingRepository, businessId: UUID, appointmentId: UUID) {
  const row = await repo.getAppointment(businessId, appointmentId);
  if (!row) throw notFound('Appointment');
  return row;
}

export async function setAppointmentStatus(
  repo: BookingRepository,
  businessId: UUID,
  appointmentId: UUID,
  status: 'completed' | 'no_show',
  actor: Actor,
): Promise<AppointmentDTO> {
  await requireAppointment(repo, businessId, appointmentId);
  return toAppointmentDTO(
    await repo.setAppointmentStatus({
      appointmentId,
      status,
      actor: actor.type,
      actorId: actor.id,
    }),
  );
}

export async function checkInAppointment(
  repo: BookingRepository,
  businessId: UUID,
  appointmentId: UUID,
  userId: string,
): Promise<AppointmentDTO> {
  await requireAppointment(repo, businessId, appointmentId);
  return toAppointmentDTO(await repo.checkInAppointment(appointmentId, userId));
}

export async function updateAppointmentNotes(
  repo: BookingRepository,
  businessId: UUID,
  appointmentId: UUID,
  notes: string | null,
): Promise<AppointmentDTO> {
  const row = await repo.updateAppointmentNotes(businessId, appointmentId, notes);
  if (!row) throw notFound('Appointment');
  return toAppointmentDTO(row);
}
