// One import point for the native module, so tests mock a single path.
export {
  addStatusListener,
  canDrawOverlays,
  completeCommand,
  configureHandsFree,
  getHandsFree,
  isLauncherIconEnabled,
  getStatus,
  isSupported,
  requestAddTile,
  requestOverlayPermission,
  setLauncherIconEnabled,
  start,
  startTalk,
  stop,
} from '../../../modules/clovie-voice';
export type {
  ClovieVoiceCommandOutcome,
  ClovieVoiceDuty,
  ClovieVoiceError,
  ClovieVoiceHandsFree,
  ClovieVoiceHandsFreeConfig,
  ClovieVoiceState,
  ClovieVoiceStatus,
  ClovieVoiceTileResult,
} from '../../../modules/clovie-voice';
