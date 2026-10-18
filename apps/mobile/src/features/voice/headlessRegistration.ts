import { AppRegistry, Platform } from 'react-native';

import { whenIdle } from '@/lib/whenIdle';

import type { TaskData } from './headlessTask';

/** Evaluated on first call, so the voice engine's imports stay out of app startup. */
const loadTask = () =>
  require('./headlessTask') as typeof import('./headlessTask');

const TASK_KEY = 'ClovieVoiceCommand';

/**
 * Android runs a registered headless task when the Hey Clovie service hears a
 * command, even with the app in the background. The registration has to exist
 * at module load, but the task's code (API client, voice engine, i18n) is
 * loaded only when a task actually runs, so it costs nothing at app start.
 */
export function registerVoiceHeadlessTask(): void {
  if (Platform.OS !== 'android') return;
  AppRegistry.registerHeadlessTask(TASK_KEY, () => async (data: TaskData) => {
    await loadTask().runVoiceHeadlessTask(data);
  });
  // Once the first screen is up, mirror the cloud-STT flag for the native service.
  whenIdle(() => {
    loadTask().syncCloudSttFlag();
  }, 5000);
}
