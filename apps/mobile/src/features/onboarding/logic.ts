import type { OnboardingRequest } from '@booking/types';

/**
 * Pure first-run logic. The owner answers two questions (business type, then
 * name) before signing in; the business is created from the type's template
 * once they have, and everything else is reviewed later from the "Get set up"
 * checklist. No React, no I/O.
 */

export type BusinessTypeId = 'barber' | 'salon' | 'beauty' | 'mix';

/** Display copy lives in i18n (`onboarding.types.<id>`); logic only knows ids. */
export const BUSINESS_TYPE_IDS: BusinessTypeId[] = [
  'barber',
  'salon',
  'beauty',
  'mix',
];

/**
 * Where the draft is: 1 = business type, 2 = name, 3 = name confirmed (the
 * owner pressed Continue and is on their way to sign in, or is signed in and
 * the business is being created).
 */
export type OnboardingStep = 1 | 2 | 3;
/** Progress dots on the boards: type, name. */
export const STAGE_COUNT = 2;
export type OnboardingStage = 1 | 2;
export type DotState = 'done' | 'active' | 'todo';

/** One entry per dot: finished stages, the current one (drawn long), the rest. */
export function dotStates(stage: OnboardingStage): DotState[] {
  return Array.from({ length: STAGE_COUNT }, (_, i) => {
    if (i + 1 < stage) return 'done';
    return i + 1 === stage ? 'active' : 'todo';
  });
}

// ----- templates -----

/** [weekday open, weekday close, Saturday open, Saturday close] per type; Sunday stays closed. */
const TYPE_HOURS: Record<BusinessTypeId, [string, string, string, string]> = {
  barber: ['08:00', '18:00', '08:00', '15:00'],
  salon: ['08:30', '17:30', '08:00', '15:00'],
  beauty: ['09:00', '17:00', '09:00', '14:00'],
  mix: ['08:30', '17:30', '08:00', '15:00'],
};

export interface ServiceTemplate {
  name: string;
  durationMinutes: number;
  /** Rand, whole numbers. */
  price: number;
}

const SERVICES_BY_TYPE: Record<BusinessTypeId, ServiceTemplate[]> = {
  barber: [
    { name: 'Skin fade', durationMinutes: 30, price: 180 },
    { name: 'Fade & beard', durationMinutes: 45, price: 240 },
    { name: 'Beard trim', durationMinutes: 20, price: 90 },
    { name: 'Kids cut', durationMinutes: 30, price: 120 },
  ],
  salon: [
    { name: 'Wash, cut & blow-dry', durationMinutes: 60, price: 420 },
    { name: 'Silk press', durationMinutes: 75, price: 550 },
    { name: 'Full-head color', durationMinutes: 120, price: 950 },
    { name: 'Knotless braids', durationMinutes: 240, price: 1200 },
  ],
  beauty: [
    { name: 'Gel manicure', durationMinutes: 45, price: 280 },
    { name: 'Brow shape & tint', durationMinutes: 30, price: 220 },
    { name: 'Lash lift', durationMinutes: 45, price: 380 },
    { name: 'Express facial', durationMinutes: 45, price: 420 },
  ],
  mix: [
    { name: 'Wash, cut & blow-dry', durationMinutes: 60, price: 420 },
    { name: 'Skin fade', durationMinutes: 30, price: 180 },
    { name: 'Gel manicure', durationMinutes: 45, price: 280 },
    { name: 'Brow shape & tint', durationMinutes: 30, price: 220 },
  ],
};

/** Monday to Friday, then Saturday; 0 = Sunday matches the API. */
function defaultHours(typeId: BusinessTypeId): OnboardingRequest['hours'] {
  const [wkOpen, wkClose, satOpen, satClose] = TYPE_HOURS[typeId];
  return [1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    opens_at: weekday === 6 ? satOpen : wkOpen,
    closes_at: weekday === 6 ? satClose : wkClose,
  }));
}

// ----- draft -----

/** Where the owner is and what they have entered; this is what survives a killed app. */
export interface OnboardingDraft {
  step: OnboardingStep;
  typeId: BusinessTypeId | null;
  businessName: string;
}

export const NAME_MAX = 120;

export function initialDraft(): OnboardingDraft {
  return { step: 1, typeId: null, businessName: '' };
}

/** One tap on a type tile picks it and moves on to the name. */
export function selectType(
  draft: OnboardingDraft,
  typeId: BusinessTypeId,
): OnboardingDraft {
  return { ...draft, typeId, step: 2 };
}

export function setName(
  draft: OnboardingDraft,
  businessName: string,
): OnboardingDraft {
  return { ...draft, businessName: businessName.slice(0, NAME_MAX) };
}

export function goBack(draft: OnboardingDraft): OnboardingDraft {
  return draft.step === 1 ? draft : { ...draft, step: 1 };
}

/** The name can be submitted once a type is chosen and the name is not blank. */
export function canSubmit(draft: OnboardingDraft): boolean {
  return draft.typeId !== null && draft.businessName.trim().length > 0;
}

/** Continue on the name: the draft is complete and waits for sign-in. */
export function confirmName(draft: OnboardingDraft): OnboardingDraft {
  return canSubmit(draft) ? { ...draft, step: 3 } : draft;
}

export type OnboardingScreen = 'welcome' | 'type' | 'name';

/** Nothing entered yet: a first launch rather than a resume. */
export const isPristine = (draft: OnboardingDraft) =>
  draft.typeId === null && draft.businessName === '';

/**
 * The screen to open on. A signed-out first launch starts at the welcome;
 * signed in with no business (and no draft) starts at the type. A resumed draft
 * reopens where it was; a confirmed one reopens on the name, one tap from
 * signing in.
 */
export function startScreen(
  draft: OnboardingDraft,
  isSignedIn: boolean,
): OnboardingScreen {
  if (isPristine(draft)) return isSignedIn ? 'type' : 'welcome';
  return draft.step === 1 ? 'type' : 'name';
}

/**
 * Signed in with a confirmed draft: create the business without asking again.
 * An unconfirmed draft waits for the owner's Continue on the name.
 */
export const shouldAutoSubmit = (draft: OnboardingDraft, isSignedIn: boolean) =>
  isSignedIn && draft.step === 3 && canSubmit(draft);

// ----- submit -----

/**
 * The whole business in one request: the type's hours and services at template
 * prices, the API's default booking rules, and the owner as the only staff.
 * Returns null until the draft can be submitted.
 * `locale` is the owner's own timezone and currency (from the device) so the
 * business is not created with a country default.
 */
export function buildOnboardingRequest(
  draft: OnboardingDraft,
  ownerName: string | null,
  locale?: { timezone: string; currency: string },
): OnboardingRequest | null {
  if (!canSubmit(draft) || draft.typeId === null) return null;
  return {
    business: {
      name: draft.businessName.trim(),
      ...(locale
        ? { timezone: locale.timezone, currency: locale.currency }
        : {}),
    },
    owner_name: ownerName?.trim() || null,
    hours: defaultHours(draft.typeId),
    services: SERVICES_BY_TYPE[draft.typeId].map((s) => ({
      name: s.name,
      duration_minutes: s.durationMinutes,
      price_cents: s.price * 100,
    })),
    team: [],
  };
}

// ----- persistence -----

export function serializeDraft(draft: OnboardingDraft): string {
  return JSON.stringify(draft);
}

/** A step is only trusted when what it needs is there: no name step without a type, no confirmation without a name. */
function resumeStep(
  step: unknown,
  type: BusinessTypeId | null,
  name: string,
): OnboardingStep {
  if (!type) return 1;
  if (step === 3 && name.trim()) return 3;
  return step === 1 ? 1 : 2;
}

/** Reads a stored draft back; anything unrecognised starts over rather than crashing. */
export function parseDraft(raw: string | null): OnboardingDraft {
  if (!raw) return initialDraft();
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return initialDraft();
    const { step, typeId, businessName } = value as Record<string, unknown>;
    const type = BUSINESS_TYPE_IDS.find((id) => id === typeId) ?? null;
    const name =
      typeof businessName === 'string' ? businessName.slice(0, NAME_MAX) : '';
    return {
      step: resumeStep(step, type, name),
      typeId: type,
      businessName: name,
    };
  } catch {
    return initialDraft();
  }
}

// ----- going back -----

/** Where Back leads from a screen: another screen, or nowhere. */
export type BackTarget = OnboardingScreen | null;

/**
 * The step a Back tap returns to. Welcome has nothing before it; the type goes
 * back to the welcome while signed out, and has nothing before it when signed in.
 * The name always goes back to the type.
 */
export function backTarget(
  screen: OnboardingScreen,
  ctx: { isSignedIn: boolean },
): BackTarget {
  if (screen === 'name') return 'type';
  if (screen === 'type') return ctx.isSignedIn ? null : 'welcome';
  return null;
}
