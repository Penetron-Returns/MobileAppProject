import type { VoiceTodayDTO } from '@booking/types';

import type { CheckInCandidate } from './checkIn';

/** `GET /v1/voice/today` rows as check-in candidates (the API sends the first name only). */
export function toCheckInCandidates(dto: VoiceTodayDTO): CheckInCandidate[] {
  return dto.appointments.map((a) => ({
    id: a.id,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    status: a.status,
    checked_in_at: a.checked_in_at,
    client: { name: a.client_first_name },
  }));
}
