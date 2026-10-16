import type { ClovieVoiceCommandOutcome } from './clovieVoice';
import {
  noOneDueMessage,
  pickAppointmentToCheckIn,
  type CheckInCandidate,
} from './checkIn';
import { parseVoiceCommand } from './logic';
import {
  answerPendingApproval,
  askCompanion,
  classifyReply,
  type AskDeps,
  type FollowUpContext,
} from './ask';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** What running a spoken command with no screen needs; injected so it is testable. */
export interface HeadlessDeps extends Pick<
  AskDeps,
  'ask' | 'decide' | 'speakInterim' | 'nextTurn'
> {
  now: () => Date;
  t: Translate;
  /** False when no signed-in session is available (the app UI never started). */
  isSignedIn: () => Promise<boolean>;
  /** Today's bookings and the business timezone (for the times in replies). */
  loadToday: () => Promise<{
    appointments: readonly CheckInCandidate[];
    timezone: string;
  }>;
  checkIn: (appointmentId: string) => Promise<unknown>;
}

/**
 * Runs a transcript from the Hey Clovie service without the app UI: "client
 * has arrived" checks someone in through the API (the fast local path);
 * anything else goes to the Nerova companion (`ask.ts`) and its reply is
 * spoken. Only a real failure, like a missing session, asks the owner to open
 * the app. `context` is set on a follow-up turn: a clear yes or no then decides
 * exactly `context.pendingApprovalId`, anything else continues the conversation.
 */
export async function runVoiceCommandHeadless(
  transcript: string,
  deps: HeadlessDeps,
  context: FollowUpContext = {},
): Promise<ClovieVoiceCommandOutcome> {
  const pendingId = context.pendingApprovalId;
  if (pendingId) {
    const verdict = classifyReply(transcript);
    if (verdict !== 'other') {
      if (!(await deps.isSignedIn())) {
        return { status: 'open_app', message: '' };
      }
      return answerPendingApproval(
        verdict,
        { ...context, pendingApprovalId: pendingId },
        deps,
      );
    }
  }
  const command = parseVoiceCommand(transcript);
  if (command.kind === 'request') {
    if (!(await deps.isSignedIn())) {
      return { status: 'open_app', message: command.text };
    }
    return askCompanion(command.text, deps);
  }
  try {
    if (!(await deps.isSignedIn())) {
      return { status: 'open_app', message: transcript };
    }
    const today = await deps.loadToday();
    const pick = pickAppointmentToCheckIn(today.appointments, {
      now: deps.now(),
      name: command.name,
    });
    if (pick.kind === 'none') {
      return {
        status: 'error',
        message:
          pick.reason === 'no_name_match' && command.name
            ? deps.t('voice.noNameMatch', { name: command.name })
            : noOneDueMessage(pick.next, {
                timezone: today.timezone,
                t: deps.t,
              }),
      };
    }
    await deps.checkIn(pick.appointment.id);
    const full = pick.appointment.client?.name ?? deps.t('today.unknownClient');
    return {
      status: 'done',
      message: deps.t('voice.checkedIn', { name: full.split(' ')[0] }),
    };
  } catch {
    // Never log the error body: it can carry names.
    return { status: 'error', message: deps.t('voice.failed') };
  }
}

/** `status=401 code=UNAUTHENTICATED`; status 0 when the server was never reached. */
export function failureReason(error: unknown): string {
  // Duck-typed (an ApiError): this module stays free of the API client.
  const { status, code } = (error ?? {}) as {
    status?: unknown;
    code?: unknown;
  };
  const safeStatus = typeof status === 'number' ? status : 0;
  const safeCode =
    typeof code === 'string' && /^[A-Z0-9_]{2,40}$/.test(code)
      ? code
      : 'UNKNOWN';
  return `status=${safeStatus} code=${safeCode}`;
}

/** The text the overlay maps to "Didn't catch that" (the native service compares it verbatim). */
export const NOT_HEARD = "Didn't catch that";

export interface ClipDeps extends HeadlessDeps {
  /** Uploads the WAV and returns what was said; rejects on any failure. */
  transcribe: (clipPath: string) => Promise<{ text: string }>;
}

/**
 * Runs a clip captured by the service: transcribes it through the backend,
 * then handles the text exactly like a typed transcript. A failed upload
 * (network, 401, 404, 5xx) answers `fallback`, its message the reason, so the service retries once with
 * Android's own recogniser. Silence in the clip is "Didn't catch that".
 */
export async function runVoiceClipHeadless(
  clipPath: string,
  deps: ClipDeps,
  context: FollowUpContext = {},
): Promise<ClovieVoiceCommandOutcome> {
  let text: string;
  try {
    text = (await deps.transcribe(clipPath)).text.trim();
  } catch (error) {
    // Reason only (HTTP status and our error code), never a body or a name: the native service logs it too.
    const reason = failureReason(error);
    // eslint-disable-next-line no-console -- reason only (status and code), never a body or a name
    console.warn(`cloud transcription failed ${reason}`);
    return { status: 'fallback', message: reason };
  }
  if (!text) return { status: 'error', message: NOT_HEARD };
  const outcome = await runVoiceCommandHeadless(text, deps, context);
  return { ...outcome, transcript: text };
}
