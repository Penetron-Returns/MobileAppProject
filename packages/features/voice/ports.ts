/** Device voice tokens: the port the API and the Supabase/in-memory repositories share. */
import type { MemberRole, UUID } from '@booking/types';

export interface DeviceTokenRow {
  id: UUID;
  business_id: UUID;
  user_id: string;
  revoked_at: string | null;
}

export interface DeviceTokenOwner {
  businessId: UUID;
  userId: string;
}

/** Persistence for `voice_device_tokens` (service role only). Only hashes are ever stored. */
export interface DeviceTokenRepository {
  insert(row: DeviceTokenOwner & { tokenHash: string; deviceLabel: string; at: Date }): Promise<void>;
  /** Revokes the live tokens of one user's device. */
  revokeDevice(owner: DeviceTokenOwner & { deviceLabel: string }, at: Date): Promise<void>;
  /** Revokes every live token of the user in the business. */
  revokeAll(owner: DeviceTokenOwner, at: Date): Promise<void>;
  /** Global by design: the unguessable hash is the credential. */
  findByHash(tokenHash: string): Promise<DeviceTokenRow | null>;
  /** The user's current membership of the business (null = removed) with the org id the auth context needs. */
  findMember(owner: DeviceTokenOwner): Promise<{ role: MemberRole; orgId: string } | null>;
  touch(id: UUID, at: Date): Promise<void>;
}

export interface DeviceTokenIdentity {
  userId: string;
  businessId: UUID;
  orgId: string;
  role: MemberRole;
}

export interface DeviceTokenService {
  /** Mints a token (shown once) and revokes the previous one of the same user and device. */
  mint(input: DeviceTokenOwner & { deviceLabel?: string }): Promise<string>;
  revoke(owner: DeviceTokenOwner): Promise<void>;
  /** The identity behind a token, or null when unknown, revoked or its member is gone. Never throws on a bad token. */
  authenticate(token: string): Promise<DeviceTokenIdentity | null>;
}
