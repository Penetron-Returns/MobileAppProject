import type { AppointmentFact, ClientFact } from '@booking/features/stories/types.ts';

export const TZ = 'Africa/Johannesburg';

/** 'YYYY-MM-DDTHH:mm' SAST wall clock (UTC+2, no DST) -> ISO instant */
export const sast = (local: string): string => new Date(`${local}:00+02:00`).toISOString();
export const sastDate = (local: string): Date => new Date(sast(local));

/** Saturday 2026-10-17, 07:50 SAST (the Brief is generated in the 30 minutes before a 08:00 opening) */
export const NOW = sastDate('2026-10-17T07:50');

const DAY = 24 * 3_600_000;
export const daysAgo = (days: number, from: Date = NOW): string => new Date(from.getTime() - days * DAY).toISOString();

let seq = 0;

/** An appointment fact; `local` is a SAST wall-clock start. Defaults: confirmed, R250, not confirmed by the client. */
export function fact(over: Partial<AppointmentFact> & { local?: string } = {}): AppointmentFact {
  seq += 1;
  const { local, ...rest } = over;
  const clientName = 'clientName' in rest ? rest.clientName! : 'Thandi Nkosi';
  return {
    id: `appt-${String(seq).padStart(4, '0')}`,
    startsAt: local ? sast(local) : sast('2026-10-17T09:00'),
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'confirmed',
    clientId: clientName ?? 'anonymous',
    clientName,
    serviceId: rest.serviceName ?? 'Silk press',
    serviceName: 'Silk press',
    priceCents: 25000,
    clientConfirmedAt: null,
    ...rest,
  };
}

export function client(name: string | null, createdAt: string, id: string = name ?? 'anonymous'): ClientFact {
  return { id, name, createdAt };
}
