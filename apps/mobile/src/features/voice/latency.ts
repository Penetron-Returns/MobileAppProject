/**
 * Voice latency, as one `voice_latency` analytics event per turn so p50/p95 can be read in PostHog. The native service
 * measures from the moment the owner stops speaking (see `docs/voice.md` > Latency) and sends `onVoiceLatency`; this
 * turns that into the event's properties. Numbers and short labels only: never a transcript, a reply or a name.
 */
import { analytics } from '@/features/analytics';
import type { VoiceLatencyProps } from '@/features/analytics/events';

import {
  addVoiceLatencyListener,
  type ClovieVoiceLatencyEvent,
} from './clovieVoice';

const STT_PATHS = ['device', 'cloud'] as const;
const ENDPOINTS = ['partial', 'recognizer', 'clip'] as const;

const NUMBER_KEYS = [
  ['finalTranscriptMs', 'final_transcript_ms'],
  ['requestSentMs', 'request_sent_ms'],
  ['firstReplyByteMs', 'first_reply_byte_ms'],
  ['interimStartMs', 'interim_start_ms'],
  ['ttsStartMs', 'tts_start_ms'],
  ['firstTokenMs', 'first_token_ms'],
  ['firstAudioMs', 'first_audio_ms'],
] as const;

const MAX_MS = 300_000;

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

/**
 * The event's properties for a native latency report, or null when there is nothing worth sending. Unknown keys and
 * labels are dropped, durations are rounded to whole ms, and negative, non-finite or absurd values are left out.
 */
export function shapeVoiceLatency(
  raw: ClovieVoiceLatencyEvent | null | undefined,
): VoiceLatencyProps | null {
  if (!raw) return null;
  const out: VoiceLatencyProps = {};
  const sttPath = pick(raw.sttPath, STT_PATHS);
  if (sttPath) out.stt_path = sttPath;
  const endpoint = pick(raw.endpoint, ENDPOINTS);
  if (endpoint) out.endpoint = endpoint;
  let steps = 0;
  for (const [from, to] of NUMBER_KEYS) {
    const value = raw[from];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const ms = Math.round(value);
    if (ms < 0 || ms > MAX_MS) continue;
    out[to] = ms;
    steps += 1;
  }
  return steps > 0 ? out : null;
}

/** Sends each native latency report as `voice_latency`. Call once, in the UI runtime; returns the unsubscribe. */
export function startVoiceLatencyReporting(): () => void {
  return addVoiceLatencyListener((event) => {
    const props = shapeVoiceLatency(event);
    if (props) analytics.track('voice_latency', props);
  });
}
