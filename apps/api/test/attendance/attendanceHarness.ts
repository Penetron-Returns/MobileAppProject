import { sast } from '../booking/fixtures.ts';
import { harness, type Harness } from '../booking/harness.ts';

export const OWNER = 'user_owner';
export const STAFF = 'user_staff';
export { sast };

/** A Date for a SAST wall-clock time (Wednesday 2026-09-30 unless another date is given). */
export const at = (hhmm: string, date?: string) => new Date(sast(hhmm, date));

/** Salon with an owner and Thandi's login, both with a registered device. */
export function attendanceHarness(opts: { staffHasDevice?: boolean; staffLinked?: boolean } = {}): Harness {
  const h = harness();
  const { id: business_id } = h.business;
  for (const [id, role] of [[OWNER, 'owner'], [STAFF, 'staff']] as const) {
    h.repo.tables.users.push({ id, business_id, role, email: null, display_name: null, avatar_url: null });
  }
  if (opts.staffLinked !== false) h.thandi.user_id = STAFF;
  h.repo.tables.device_push_tokens.push({ business_id, user_id: OWNER, token: 'ExponentPushToken[owner]', platform: 'ios' });
  if (opts.staffHasDevice !== false) {
    h.repo.tables.device_push_tokens.push({ business_id, user_id: STAFF, token: 'ExponentPushToken[staff]', platform: 'ios' });
  }
  return h;
}

/** Books a 60 minute Cut with Thandi on Wednesday 2026-09-30 through the API; returns the appointment id. */
export async function book(h: Harness, hhmm = '10:00'): Promise<string> {
  const res = await h.call('POST', '/v1/appointments', {
    body: { client_id: h.client.id, service_id: h.cut.id, staff_id: h.thandi.id, starts_at: sast(hhmm) },
  });
  if (res.status !== 201) throw new Error(`booking failed: ${JSON.stringify(res.body)}`);
  return res.body.data.id;
}

export const statusOf = (h: Harness, appointmentId: string) => h.repo.tables.appointments.find((a) => a.id === appointmentId)!.status;
