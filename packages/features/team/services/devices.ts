/** Push-notification device registration for staff. */
import type { UUID } from '@booking/types';
import type { BookingRepository } from '../../repositories/types.ts';

export async function registerDevice(
  repo: BookingRepository,
  businessId: UUID,
  userId: string,
  token: string,
  platform: string,
): Promise<{ token: string; platform: string }> {
  await repo.upsertDeviceToken(businessId, userId, token, platform);
  return { token, platform };
}
