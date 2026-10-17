/**
 * Companion settings (approval policy, undo window): a thin owner-only proxy to Nerova's
 * `/v1/accounts/{id}/companion/settings`. Changes are audited in `audit_log` (entity `companion_settings`).
 * Depends on the NerovaClient and PlanRepository ports and an audit sink only.
 */
import type { CompanionSettingsDTO, UUID } from '@booking/types';
import { AppError } from '@booking/features/lib/errors.ts';
import type { AuditEntry } from '@booking/features/repositories/types.ts';
import type { PlanRepository } from '@booking/features/ports.ts';
import type { CompanionSettingsPatch, NerovaClient } from './client.ts';

export interface CompanionSettingsCaller {
  businessId: UUID;
  userId: string;
  requestId?: string | undefined;
}

export interface CompanionSettingsService {
  get(businessId: UUID): Promise<CompanionSettingsDTO>;
  /** Partial update; the Idempotency-Key is forwarded to Nerova. Audited. */
  update(caller: CompanionSettingsCaller, patch: CompanionSettingsPatch, idempotencyKey: string): Promise<CompanionSettingsDTO>;
}

export interface CompanionSettingsDeps {
  nerova: Pick<NerovaClient, 'getCompanionSettings' | 'updateCompanionSettings'>;
  plans: Pick<PlanRepository, 'getProfile'>;
  recordAudit: (entry: AuditEntry) => Promise<void>;
}

const notReady = () => new AppError('COMPANION_NOT_READY', 'The companion is not ready yet', { reason: 'account_not_found', next_step: 'connect_booking_system' });

export function createCompanionSettingsService(deps: CompanionSettingsDeps): CompanionSettingsService {
  /** The cached Nerova account id, else our business id (Nerova accepts it as the externalReference). */
  const accountRef = async (businessId: UUID) => (await deps.plans.getProfile(businessId)).nerovaAccountId ?? businessId;

  return {
    async get(businessId) {
      const settings = await deps.nerova.getCompanionSettings(await accountRef(businessId));
      if (!settings) throw notReady();
      return settings;
    },

    async update(caller, patch, idempotencyKey) {
      const settings = await deps.nerova.updateCompanionSettings(await accountRef(caller.businessId), patch, idempotencyKey);
      await deps.recordAudit({
        businessId: caller.businessId,
        actorId: caller.userId,
        action: 'update',
        entity: 'companion_settings',
        entityId: caller.businessId,
        diff: { ...patch },
        ...(caller.requestId ? { requestId: caller.requestId } : {}),
      });
      return settings;
    },
  };
}
