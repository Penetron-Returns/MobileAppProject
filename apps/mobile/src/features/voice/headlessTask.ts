import { fetchAppointmentsBetween } from '@/features/appointments/hooks';
import { fetchBusiness } from '@/features/business/hooks';
import { api, newIdempotencyKey } from '@/lib/api';
import { resolveBearer } from '@/lib/auth-token';
import i18n from '@/lib/i18n';
import { qk, queryClient } from '@/lib/query';
import { dayRangeUtc, todayISO } from '@/lib/time';

import {
  createFillerGate,
  isStreamUnavailable,
  streamVoiceAsk,
} from './askStream';
import {
  completeCommand,
  endStreamedReply,
  isCommandActive,
  recordTiming,
  setCloudStt,
  speakInterim,
  streamReplyDelta,
  supportsStreamedSpeech,
} from './clovieVoice';
import {
  runVoiceClipHeadless,
  runVoiceCommandHeadless,
  type HeadlessDeps,
} from './headless';
import { rememberAction } from './actionStore';
import { createInstantAnswerer } from './instant';
import { toCheckInCandidates } from './today';
import { createPrefetcher } from './todayPrefetch';
import { isCloudSttEnabled, transcribeClip } from './transcribe';

export interface TaskData {
  id: string;
  /** A transcript from Android's recogniser, or... */
  transcript?: string;
  /** ...a clip (m4a, or WAV) the service captured, for the backend to transcribe. */
  clipPath?: string;
  /** The wake word just fired: load today's bookings now and finish; no command follows in this task. */
  prefetch?: boolean;
  /** With `prefetch`: also ping the API so TLS and the Edge isolate are warm before the request. */
  warm?: boolean;
  /** Epoch ms (as a string) when the service asked for this task: how long the JS runtime took to start. */
  startedAt?: string;
  /** Follow-up turns only: the approval the service just read aloud, its kind and the ones still queued (JSON). */
  pendingApprovalId?: string;
  pendingKind?: string;
  pendingQueue?: string;
  /** After an executed action: its id and when its undo window closes (epoch ms, as a string). */
  pendingActionId?: string;
  undoUntilMs?: string;
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

/** The "One sec" filler waits this long for a streamed reply's first sentence before it speaks. */
export const FILLER_DELAY_MS = 1200;

/**
 * What a spoken command needs with no screen: the app's clock, strings and API client. With a `commandId` (the headless
 * task's), a build that can speak streamed text reads the reply as a stream and speaks each sentence as it completes.
 */
export function createHeadlessDeps(commandId?: string): HeadlessDeps {
  const isStreaming = commandId !== undefined && supportsStreamedSpeech();
  const filler = createFillerGate(speakInterim, FILLER_DELAY_MS);
  const now = () => new Date();
  const t = (key: string, values?: Record<string, unknown>) =>
    i18n.t(key, values) as string;
  return {
    now,
    t,
    instant: createInstantAnswerer({ now, t, load: loadToday }),
    // A Clerk session or the device voice token: either can check someone in.
    isSignedIn: async () =>
      (await resolveBearer({ allowDeviceToken: true })) !== null,
    loadToday,
    speakInterim: (text: string) => filler.schedule(text, isStreaming),
    nextTurn: () => companionTurns++,
    rememberAction,
    ask: async (text: string) => {
      // Wall-clock stamps the service turns into offsets from the end of speech (the `voice_latency` event).
      const sent = Date.now();
      recordTiming('requestSentAt', sent);
      if (isStreaming) {
        const streamed = await askStreamed(
          commandId,
          text,
          sent,
          filler.cancel,
        );
        if (streamed) return streamed;
      }
      const reply = await api.voiceAsk({ text }, newIdempotencyKey());
      // The whole reply arrives at once, so this is also its first byte (and its first token).
      const received = Date.now();
      recordTiming('firstReplyByteAt', received);
      recordTiming('firstTokenAt', received);
      recordTiming('askMs', received - sent);
      return reply;
    },
    decide: async (id: string, decision: 'approve' | 'decline') =>
      api.voiceDecideApproval(id, decision, newIdempotencyKey()),
    undo: async (id: string) => api.voiceUndoAction(id, `action:${id}:undo`),
    checkIn: async (id: string) => {
      await api.checkInAppointment(id, newIdempotencyKey());
      void queryClient.invalidateQueries({ queryKey: qk.appointments });
      void queryClient.invalidateQueries({ queryKey: qk.dashboardAll });
    },
  };
}

/**
 * One streamed ask: every text delta goes to the service as it arrives (it speaks each completed sentence), the stamps
 * for first byte and first token are recorded, and the reply is returned at `done`. Null when the API has no stream route
 * yet and nothing was spoken, so the caller uses the whole-reply call.
 */
async function askStreamed(
  commandId: string,
  text: string,
  sent: number,
  onFirstText: () => void,
) {
  let hasText = false;
  try {
    const reply = await streamVoiceAsk(text, newIdempotencyKey(), {
      onFirstByte: () => recordTiming('firstReplyByteAt', Date.now()),
      onText: (delta) => {
        if (!hasText) {
          hasText = true;
          recordTiming('firstTokenAt', Date.now());
          onFirstText();
        }
        streamReplyDelta(commandId, delta);
      },
      isActive: () => isCommandActive(commandId),
    });
    // The last held sentence is spoken now; the outcome then adds whatever the sentences did not cover.
    endStreamedReply(commandId);
    recordTiming('askMs', Date.now() - sent);
    return reply;
  } catch (error) {
    if (!hasText && isStreamUnavailable(error)) return null;
    throw error;
  } finally {
    onFirstText();
  }
}

/** The tile, widget and side key start the service without JS: keep its copy of the cloud-STT flag current. */
export function syncCloudSttFlag(): void {
  setCloudStt(isCloudSttEnabled);
}

/**
 * Runs one Hey Clovie headless task (registered in `headlessRegistration.ts`):
 * a prefetch at the wake word, or a spoken command whose outcome the service
 * shows in its overlay. It only has a signed-in session when the app's UI has
 * run since launch (Clerk registers its token getter then); otherwise it asks
 * the owner to open the app.
 */
export async function runVoiceHeadlessTask(data: TaskData): Promise<void> {
  if (data.prefetch) {
    if (data.warm) void api.voicePing().catch(() => undefined);
    await todayPrefetcher.prefetch();
    return;
  }
  const startedAt = Number(data.startedAt);
  if (Number.isFinite(startedAt)) {
    recordTiming('headlessStartMs', Math.max(0, Date.now() - startedAt));
  }
  const deps = createHeadlessDeps(data.id);
  // A follow-up turn carries the approval the service just read aloud, so a yes or no binds to that id.
  const followUp = {
    pendingApprovalId: data.pendingApprovalId || undefined,
    pendingKind: data.pendingKind || undefined,
    pendingQueue: data.pendingQueue || undefined,
    pendingActionId: data.pendingActionId || undefined,
    undoUntilMs: Number(data.undoUntilMs) || undefined,
  };
  const outcome = data.clipPath
    ? await runVoiceClipHeadless(
        data.clipPath,
        { ...deps, transcribe: transcribeClip },
        followUp,
      )
    : await runVoiceCommandHeadless(data.transcript ?? '', deps, followUp);
  completeCommand(data.id, outcome);
}
