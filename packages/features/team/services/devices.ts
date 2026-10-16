/** Push-notification device registration for staff. */
import type { UUID } from '@booking/types';
import type { BookingRepository } from '../../repositories/types.ts';

/** Sign-out: stops pushes to this phone. Only the user's own token is removed. */
export async function unregisterDevice(repo: BookingRepository, businessId: UUID, userId: string, token: string): Promise<void> {
  await repo.deleteDeviceToken(businessId, userId, token);
}

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
