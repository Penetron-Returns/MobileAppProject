/**
 * The onboarding funnel's events and the only properties each may carry. The
 * types are the privacy contract: ids, enums and counts, never a name, email,
 * phone number or business name.
 */
export type OnboardingBusinessType = 'barber' | 'salon' | 'beauty' | 'mix';
export type OnboardingPlan = 'starter' | 'growth' | 'pro';
/** How a checkout ended once the owner came back (`PollOutcome` in plans/checkout). */
export type CheckoutOutcome = 'active' | 'timeout' | 'aborted';

export interface AnalyticsEvents {
  onboarding_started: Record<string, never>;
  onboarding_type_selected: { type: OnboardingBusinessType };
  /** Deliberately without the name. */
  onboarding_name_entered: Record<string, never>;
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
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** The only property keys that may leave the device; anything else is dropped. */
export const ALLOWED_PROPERTY_KEYS: readonly string[] = [
  'type',
  'plan',
  'outcome',
];

/** Drops every property that is not an allowed key holding a short enum-like string. */
export function safeProperties(
  props: Record<string, unknown> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ALLOWED_PROPERTY_KEYS) {
    const value = props?.[key];
    if (typeof value === 'string' && /^[a-z_]{1,24}$/.test(value)) {
      out[key] = value;
    }
  }
  return out;
}
