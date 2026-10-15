// One import point for the native module, so tests mock a single path.
export {
  addStatusListener,
  canDrawOverlays,
  completeCommand,
  getStatus,
  isSupported,
  requestOverlayPermission,
  start,
  stop,
} from '../../../modules/clovie-voice';
export type {
  ClovieVoiceCommandOutcome,
  ClovieVoiceError,
  ClovieVoiceState,
  ClovieVoiceStatus,
} from '../../../modules/clovie-voice';
