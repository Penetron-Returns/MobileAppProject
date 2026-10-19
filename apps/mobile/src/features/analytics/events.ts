/**
 * The onboarding funnel's events and the only properties each may carry. The
 * types are the privacy contract: ids, enums and counts, never a name, email,
 * phone number or business name.
 */
export type OnboardingBusinessType = 'barber' | 'salon' | 'beauty' | 'mix';
export type OnboardingPlan = 'starter' | 'growth' | 'pro';
/**
 * How a checkout ended once the owner came back: paid and returned (success),
 * closed the tab (cancel), or the plan never flipped while waiting (timeout)
 * or they stopped waiting (aborted).
 */
export type CheckoutOutcome = 'success' | 'cancel' | 'timeout' | 'aborted';

export interface AnalyticsEvents {
  onboarding_started: Record<string, never>;
  onboarding_type_selected: { type: OnboardingBusinessType };
  /** Deliberately without the name. */
  onboarding_name_entered: Record<string, never>;
  /** Back on any first-run step; deliberately without which one. */
  onboarding_back: Record<string, never>;
  signin_started: Record<string, never>;
  signin_code_sent: Record<string, never>;
  signin_completed: Record<string, never>;
  business_created: Record<string, never>;
  plan_viewed: Record<string, never>;
  checkout_started: { plan: OnboardingPlan };
  checkout_returned: { outcome: CheckoutOutcome };
  plan_activated: { plan: OnboardingPlan };
  setup_waiting_shown: Record<string, never>;
  onboarding_completed: Record<string, never>;
  /**
   * One voice turn: milliseconds after the owner stopped speaking for each step that happened, and how speech ended.
   * Durations and labels only, never a transcript or a name (see `features/voice/latency.ts`).
   */
  voice_latency: VoiceLatencyProps;
  /** An instant (no-LLM) voice answer: which intent, whether it answered, how long it took. Never text. */
  voice_instant_answer: VoiceInstantAnswerProps;
}

export type VoiceLatencyProps = {
  stt_path?: 'device' | 'cloud';
  endpoint?: 'partial' | 'recognizer' | 'clip';
  final_transcript_ms?: number;
  request_sent_ms?: number;
  first_reply_byte_ms?: number;
  interim_start_ms?: number;
  tts_start_ms?: number;
  first_token_ms?: number;
  first_audio_ms?: number;
};

export type VoiceInstantAnswerProps = {
  intent: string;
  matched: 'true' | 'false';
  ms: number;
};

export type AnalyticsEventName = keyof AnalyticsEvents;

/** The only property keys that may leave the device; anything else is dropped. */
export const ALLOWED_PROPERTY_KEYS: readonly string[] = [
  'type',
  'plan',
  'outcome',
  'stt_path',
  'endpoint',
  'intent',
  'matched',
];

/** Numeric properties that may leave the device: durations in ms, kept only as finite whole numbers in 0..300000. */
export const ALLOWED_NUMBER_KEYS: readonly string[] = [
  'final_transcript_ms',
  'request_sent_ms',
  'first_reply_byte_ms',
  'interim_start_ms',
  'tts_start_ms',
  'first_token_ms',
  'first_audio_ms',
  'ms',
];
const MAX_DURATION_MS = 300_000;

/** Drops every property that is not an allowed key holding a short enum-like string. */
export function safeProperties(
  props: Record<string, unknown> | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const key of ALLOWED_PROPERTY_KEYS) {
    const value = props?.[key];
    if (typeof value === 'string' && /^[a-z_]{1,24}$/.test(value)) {
      out[key] = value;
    }
  }
  for (const key of ALLOWED_NUMBER_KEYS) {
    const value = props?.[key];
    if (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= MAX_DURATION_MS
    ) {
      out[key] = value;
    }
  }
  return out;
}
