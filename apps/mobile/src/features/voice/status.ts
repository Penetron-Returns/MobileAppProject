import type { ClovieVoiceStatus } from './clovieVoice';

/** Statuses where the service is running (or about to). */
export function isVoiceOn(status: ClovieVoiceStatus): boolean {
  return status === 'starting' || status === 'listening' || status === 'busy';
}

/** The toggle can be turned on unless the build has no wake-word models. */
export function canTurnOnVoice(status: ClovieVoiceStatus): boolean {
  return status !== 'not_configured';
}
