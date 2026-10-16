import { AppRegistry, Platform } from 'react-native';

import { fetchAppointmentsBetween } from '@/features/appointments/hooks';
import { fetchBusiness } from '@/features/business/hooks';
import { api, newIdempotencyKey } from '@/lib/api';
import { resolveBearer } from '@/lib/auth-token';
import i18n from '@/lib/i18n';
import { qk, queryClient } from '@/lib/query';
import { dayRangeUtc, todayISO } from '@/lib/time';

import {
  completeCommand,
  recordTiming,
  setCloudStt,
  speakInterim,
} from './clovieVoice';
import {
  runVoiceClipHeadless,
  runVoiceCommandHeadless,
  type HeadlessDeps,
} from './headless';
import { toCheckInCandidates } from './today';
import { createPrefetcher } from './todayPrefetch';
import { isCloudSttEnabled, transcribeClip } from './transcribe';

const TASK_KEY = 'ClovieVoiceCommand';

interface TaskData {
  id: string;
  /** A transcript from Android's recogniser, or... */
  transcript?: string;
  /** ...a clip (m4a, or WAV) the service captured, for the backend to transcribe. */
  clipPath?: string;
  /** The wake word just fired: load today's bookings now and finish; no command follows in this task. */
  prefetch?: boolean;
  /** Epoch ms (as a string) when the service asked for this task: how long the JS runtime took to start. */
  startedAt?: string;
  /** Follow-up turns only: the approval the service just read aloud, its kind and the ones still queued (JSON). */
  pendingApprovalId?: string;
  pendingKind?: string;
  pendingQueue?: string;
}

/** How long a prefetched list of today's bookings is trusted. The command comes a few seconds after the wake word. */
const PREFETCH_TTL_MS = 30_000;

/**
 * Today's bookings. With a Clerk session (the UI ran since launch) it reads through Supabase as the app does;
 * with only the device voice token it uses `GET /v1/voice/today`, which the token may call.
 */
async function loadTodayFresh() {
  const clerk = await resolveBearer({ allowDeviceToken: false }).catch(
    () => null,
  );
  if (!clerk) {
    const today = await api.voiceToday();
    return {
      appointments: toCheckInCandidates(today),
      timezone: today.timezone,
    };
  }
  const business = await queryClient.fetchQuery({
    queryKey: qk.business,
    queryFn: fetchBusiness,
    staleTime: 5 * 60_000,
  });
  const { from, to } = dayRangeUtc(
    todayISO(business.timezone),
    business.timezone,
  );
  return {
    appointments: await fetchAppointmentsBetween(
      from.toISOString(),
      to.toISOString(),
    ),
    timezone: business.timezone,
  };
}

const todayPrefetcher = createPrefetcher({
  load: loadTodayFresh,
  now: () => Date.now(),
  ttlMs: PREFETCH_TTL_MS,
});

/** Today's bookings from the prefetch started at the wake word when there is one, else a fresh load. */
async function loadToday() {
  const started = Date.now();
  const prefetched = todayPrefetcher.take();
  let result: Awaited<ReturnType<typeof loadTodayFresh>> | undefined;
  if (prefetched) result = await prefetched.catch(() => undefined);
  const isPrefetched = result !== undefined;
  result ??= await loadTodayFresh();
  // Timings only (never names or times of bookings), next to the native ones in logcat.
  recordTiming('todayMs', Date.now() - started);
  recordTiming('todayPrefetched', isPrefetched ? 1 : 0);
  return result;
}

let companionTurns = 0;

/** What a spoken command needs with no screen: the app's clock, strings and API client. */
export function createHeadlessDeps(): HeadlessDeps {
  return {
    now: () => new Date(),
    t: (key: string, values?: Record<string, unknown>) =>
      i18n.t(key, values) as string,
    // A Clerk session or the device voice token: either can check someone in.
    isSignedIn: async () =>
      (await resolveBearer({ allowDeviceToken: true })) !== null,
    loadToday,
    speakInterim,
    nextTurn: () => companionTurns++,
    ask: async (text: string) => api.voiceAsk({ text }, newIdempotencyKey()),
    decide: async (id: string, decision: 'approve' | 'decline') =>
      api.voiceDecideApproval(id, decision, newIdempotencyKey()),
    checkIn: async (id: string) => {
      await api.checkInAppointment(id, newIdempotencyKey());
      void queryClient.invalidateQueries({ queryKey: qk.appointments });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardAll });
    },
  };
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
    if (data.prefetch) {
      await todayPrefetcher.prefetch();
      return;
    }
    const startedAt = Number(data.startedAt);
    if (Number.isFinite(startedAt)) {
      recordTiming('headlessStartMs', Math.max(0, Date.now() - startedAt));
    }
    const deps = createHeadlessDeps();
    // A follow-up turn carries the approval the service just read aloud, so a yes or no binds to that id.
    const followUp = {
      pendingApprovalId: data.pendingApprovalId || undefined,
      pendingKind: data.pendingKind || undefined,
      pendingQueue: data.pendingQueue || undefined,
    };
    const outcome = data.clipPath
      ? await runVoiceClipHeadless(
          data.clipPath,
          { ...deps, transcribe: transcribeClip },
          followUp,
        )
      : await runVoiceCommandHeadless(data.transcript ?? '', deps, followUp);
    completeCommand(data.id, outcome);
  });
}
