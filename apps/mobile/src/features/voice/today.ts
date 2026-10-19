import type { VoiceTodayDTO } from '@booking/types';

import type { InstantAppointment } from './instant/types';

/** `GET /v1/voice/today` rows as check-in candidates (and instant-answer rows) (the API sends the first name only). */
export function toCheckInCandidates(dto: VoiceTodayDTO): InstantAppointment[] {
  return dto.appointments.map((a) => ({
    id: a.id,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    status: a.status,
    checked_in_at: a.checked_in_at,
    client: { name: a.client_first_name },
    staff_id: a.staff_id,
    service: { name: a.service_name },
  }));
}
