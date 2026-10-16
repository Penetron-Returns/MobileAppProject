import { AppRegistry, Platform } from 'react-native';

import { fetchAppointmentsBetween } from '@/features/appointments/hooks';
import { fetchBusiness } from '@/features/business/hooks';
import { api, newIdempotencyKey } from '@/lib/api';
import { getAuthToken } from '@/lib/auth-token';
import i18n from '@/lib/i18n';
import { qk, queryClient } from '@/lib/query';
import { dayRangeUtc, todayISO } from '@/lib/time';

import { completeCommand, setCloudStt } from './clovieVoice';
import { runVoiceClipHeadless, runVoiceCommandHeadless } from './headless';
import { isCloudSttEnabled, transcribeClip } from './transcribe';

const TASK_KEY = 'ClovieVoiceCommand';

interface TaskData {
  id: string;
  /** A transcript from Android's recogniser, or... */
  transcript?: string;
  /** ...a WAV clip the service captured, for the backend to transcribe. */
  clipPath?: string;
}

async function loadToday() {
  const business = await queryClient.fetchQuery({
    queryKey: qk.business,
    queryFn: fetchBusiness,
    staleTime: 5 * 60_000,
  });
  const { from, to } = dayRangeUtc(
    todayISO(business.timezone),
    business.timezone,
  );
  return fetchAppointmentsBetween(from.toISOString(), to.toISOString());
}

/**
 * Android runs this when the Hey Clovie service hears a command, even with
 * the app in the background, and shows the outcome in its overlay. It only
 * has a signed-in session when the app's UI has run since launch (Clerk
 * registers its token getter then); otherwise it asks the owner to open the app.
 */
export function registerVoiceHeadlessTask(): void {
  if (Platform.OS !== 'android') return;
  // The tile, widget and side key start the service without JS: keep its copy of the flag current.
  setCloudStt(isCloudSttEnabled);
  AppRegistry.registerHeadlessTask(TASK_KEY, () => async (data: TaskData) => {
    const deps = {
      now: () => new Date(),
      t: (key: string, values?: Record<string, unknown>) =>
        i18n.t(key, values) as string,
      isSignedIn: async () => (await getAuthToken()) !== null,
      loadToday,
      checkIn: async (id: string) => {
        await api.checkInAppointment(id, newIdempotencyKey());
        void queryClient.invalidateQueries({ queryKey: qk.appointments });
        void queryClient.invalidateQueries({ queryKey: qk.dashboardAll });
      },
    };
    const outcome = data.clipPath
      ? await runVoiceClipHeadless(data.clipPath, {
          ...deps,
          transcribe: transcribeClip,
        })
      : await runVoiceCommandHeadless(data.transcript ?? '', deps);
    completeCommand(data.id, outcome);
  });
}
