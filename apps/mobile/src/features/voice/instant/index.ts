import { analytics } from '@/features/analytics';

import { answerInstant, type InstantDeps } from './answer';

/** Whether this phone shows the time in 12-hour form. US English is the default when the platform cannot say. */
export function deviceUses12Hour(): boolean {
  try {
    const cycle = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
    }).resolvedOptions().hourCycle;
    return cycle ? cycle === 'h12' || cycle === 'h11' : true;
  } catch {
    return true;
  }
}

/**
 * The answerer the voice flow calls after the final transcript and before `/v1/voice/ask`: text in, the answer or
 * null (ask Clovie) out. Reports `voice_instant_answer` (intent, matched, ms; never the transcript).
 */
export function createInstantAnswerer(
  base: Pick<InstantDeps, 'now' | 't'> & { load: InstantDeps['load'] },
): (transcript: string) => Promise<string | null> {
  return (transcript) =>
    answerInstant(transcript, {
      ...base,
      h12: deviceUses12Hour(),
      report: (event) =>
        analytics.track('voice_instant_answer', {
          intent: event.intent,
          matched: event.answered ? 'true' : 'false',
          ms: event.ms,
        }),
    });
}
