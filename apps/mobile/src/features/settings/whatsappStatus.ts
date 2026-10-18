import type { CompanionSetupDTO } from '@booking/types';

export type GoLiveStepId = 'connect' | 'goLive';
export type WhatsAppPill = 'connected' | 'pending' | 'not_connected';
export type VerificationPill = 'verified' | 'pending' | 'not_verified';

/**
 * What still stands between the owner and a live Clovie, in order. Nerova
 * lists many activation blockers, but only two things are the owner's to do:
 * connect the number, then tap Go live in Clovie's setup (which grants the
 * mandates and consents). Any blocker we do not know folds into Go live.
 */
export function goLiveSteps(setup: CompanionSetupDTO): GoLiveStepId[] {
  const steps: GoLiveStepId[] = [];
  if (!setup.whatsapp.connected) steps.push('connect');
  if (!setup.companion_live) steps.push('goLive');
  return steps;
}

export function whatsAppPill(setup: CompanionSetupDTO): WhatsAppPill {
  if (setup.whatsapp.connected) return 'connected';
  return setup.whatsapp.state === 'not_connected' ? 'not_connected' : 'pending';
}

export function verificationPill(
  whatsapp: CompanionSetupDTO['whatsapp'],
): VerificationPill {
  if (whatsapp.business_verified) return 'verified';
  const status = (whatsapp.business_verification_status ?? '').toLowerCase();
  return /pend|review|submit|progress/.test(status)
    ? 'pending'
    : 'not_verified';
}
