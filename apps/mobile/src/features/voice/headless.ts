import type { ClovieVoiceCommandOutcome } from './clovieVoice';
import { pickAppointmentToCheckIn, type CheckInCandidate } from './checkIn';
import { parseVoiceCommand } from './logic';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** What running a spoken command with no screen needs; injected so it is testable. */
export interface HeadlessDeps {
  now: () => Date;
  t: Translate;
  /** False when no signed-in session is available (the app UI never started). */
  isSignedIn: () => Promise<boolean>;
  /** Today's bookings in the business timezone. */
  loadToday: () => Promise<readonly CheckInCandidate[]>;
  checkIn: (appointmentId: string) => Promise<unknown>;
}

/**
 * Runs a transcript from the Hey Clovie service without the app UI: "client
 * has arrived" checks someone in through the API; anything else (or anything
 * that cannot finish here, like a missing session) asks the owner to open the
 * app, where the `/voice` route handles it with the full UI.
 */
export async function runVoiceCommandHeadless(
  transcript: string,
  deps: HeadlessDeps,
): Promise<ClovieVoiceCommandOutcome> {
  const command = parseVoiceCommand(transcript);
  if (command.kind === 'request') {
    return { status: 'open_app', message: command.text };
  }
  try {
    if (!(await deps.isSignedIn())) {
      return { status: 'open_app', message: transcript };
    }
    const pick = pickAppointmentToCheckIn(await deps.loadToday(), {
      now: deps.now(),
      name: command.name,
    });
    if (pick.kind === 'none') {
      return {
        status: 'error',
        message:
          pick.reason === 'no_name_match' && command.name
            ? deps.t('voice.noNameMatch', { name: command.name })
            : deps.t('voice.noAppointment'),
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

/** The text the overlay maps to "Didn't catch that" (the native service compares it verbatim). */
export const NOT_HEARD = "Didn't catch that";

export interface ClipDeps extends HeadlessDeps {
  /** Uploads the WAV and returns what was said; rejects on any failure. */
  transcribe: (clipPath: string) => Promise<{ text: string }>;
}

/**
 * Runs a clip captured by the service: transcribes it through the backend,
 * then handles the text exactly like a typed transcript. A failed upload
 * (network, 404, 5xx) answers `fallback` so the service retries once with
 * Android's own recogniser. Silence in the clip is "Didn't catch that".
 */
export async function runVoiceClipHeadless(
  clipPath: string,
  deps: ClipDeps,
): Promise<ClovieVoiceCommandOutcome> {
  let text: string;
  try {
    text = (await deps.transcribe(clipPath)).text.trim();
  } catch {
    return { status: 'fallback', message: '' };
  }
  if (!text) return { status: 'error', message: NOT_HEARD };
  const outcome = await runVoiceCommandHeadless(text, deps);
  return { ...outcome, transcript: text };
}
