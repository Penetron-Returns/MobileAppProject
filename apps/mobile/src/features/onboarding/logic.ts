import type { OnboardingRequest } from '@shared/api';

/** Pure onboarding flow logic (design: Onboarding.dc.html). No React, no I/O. */

export const STEP_COUNT = 5;
export type Step = 1 | 2 | 3 | 4 | 5;
export const MAX_TEAM = 20;

export type BusinessTypeId = 'barber' | 'salon' | 'beauty' | 'mix';

export const BUSINESS_TYPES: {
  id: BusinessTypeId;
  title: string;
  subtitle: string;
  /** Lowercase noun used in the closing summary. */
  noun: string;
}[] = [
  {
    id: 'barber',
    title: 'Barber shop',
    subtitle: 'Fades, shaves and beard trims',
    noun: 'barber shop',
  },
  {
    id: 'salon',
    title: 'Hair salon',
    subtitle: 'Cuts, colour, braids and styling',
    noun: 'hair salon',
  },
  {
    id: 'beauty',
    title: 'Beauty parlour',
    subtitle: 'Nails, lashes, brows, facials',
    noun: 'beauty parlour',
  },
  {
    id: 'mix',
    title: 'A mix',
    subtitle: 'Hair plus nails or beauty',
    noun: 'mixed business',
  },
];

export const STEP_HEADINGS: Record<
  1 | 2 | 3 | 4,
  { title: string; subtitle: string }
> = {
  1: {
    title: 'What kind of business?',
    subtitle: 'We set up sensible defaults. You can change everything later.',
  },
  2: {
    title: 'Your name and hours',
    subtitle: 'Clients see your name in WhatsApp. Hours are filled in for you.',
  },
  3: {
    title: 'Your services',
    subtitle: 'Switch off what you do not offer and adjust prices.',
  },
  4: {
    title: 'Your team',
    subtitle: 'Add the people who take bookings. You are already in.',
  },
};

// ----- hours -----

export type DayGroupId = 'weekdays' | 'saturday' | 'sunday';

export const DAY_GROUPS: {
  id: DayGroupId;
  name: string;
  /** 0 = Sunday, matching the API. */
  weekdays: number[];
  defaultOpen: boolean;
}[] = [
  {
    id: 'weekdays',
    name: 'Monday to Friday',
    weekdays: [1, 2, 3, 4, 5],
    defaultOpen: true,
  },
  { id: 'saturday', name: 'Saturday', weekdays: [6], defaultOpen: true },
  { id: 'sunday', name: 'Sunday', weekdays: [0], defaultOpen: false },
];

/** [weekday open, weekday close, Saturday open, Saturday close] per type. */
const TYPE_HOURS: Record<BusinessTypeId, [string, string, string, string]> = {
  barber: ['08:00', '18:00', '08:00', '15:00'],
  salon: ['08:30', '17:30', '08:00', '15:00'],
  beauty: ['09:00', '17:00', '09:00', '14:00'],
  mix: ['08:30', '17:30', '08:00', '15:00'],
};
const SUNDAY_RANGE: [string, string] = ['09:00', '13:00'];

// ----- services -----

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
    { name: 'Full-head colour', durationMinutes: 120, price: 950 },
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

// ----- draft -----

export interface TeamMember {
  name: string;
  title: string;
}

/** Everything the owner has entered. Defaults are derived, overrides stored. */
export interface OnboardingDraft {
  typeId: BusinessTypeId;
  businessName: string;
  dayOpen: Partial<Record<DayGroupId, boolean>>;
  serviceOff: Record<string, boolean>;
  /** Price text per service name (digits only); absent = template price. */
  prices: Record<string, string>;
  team: TeamMember[];
}

export function initialDraft(): OnboardingDraft {
  return {
    typeId: 'salon',
    businessName: '',
    dayOpen: {},
    serviceOff: {},
    prices: {},
    team: [],
  };
}

export interface HoursRowView {
  id: DayGroupId;
  name: string;
  isOpen: boolean;
  opens: string;
  closes: string;
  /** "08:30 to 17:30" or "Closed". */
  value: string;
}

export function hoursFor(draft: OnboardingDraft): HoursRowView[] {
  const [wkOpen, wkClose, satOpen, satClose] = TYPE_HOURS[draft.typeId];
  const ranges: Record<DayGroupId, [string, string]> = {
    weekdays: [wkOpen, wkClose],
    saturday: [satOpen, satClose],
    sunday: SUNDAY_RANGE,
  };
  return DAY_GROUPS.map((g) => {
    const isOpen = draft.dayOpen[g.id] ?? g.defaultOpen;
    const [opens, closes] = ranges[g.id];
    return {
      id: g.id,
      name: g.name,
      isOpen,
      opens,
      closes,
      value: isOpen ? `${opens} to ${closes}` : 'Closed',
    };
  });
}

export interface ServiceRowView extends ServiceTemplate {
  isOn: boolean;
  /** What the price field shows (rand, digits only). */
  priceText: string;
  detail: string;
}

export function servicesFor(draft: OnboardingDraft): ServiceRowView[] {
  return SERVICES_BY_TYPE[draft.typeId].map((s) => ({
    ...s,
    isOn: !draft.serviceOff[s.name],
    priceText: draft.prices[s.name] ?? String(s.price),
    detail: `${s.durationMinutes} min`,
  }));
}

/** Keeps digits only, at most 6 (R 999 999). */
export function sanitizePrice(text: string): string {
  return text.replace(/[^0-9]/g, '').slice(0, 6);
}

export function selectType(
  draft: OnboardingDraft,
  typeId: BusinessTypeId,
): OnboardingDraft {
  return { ...draft, typeId };
}

export function toggleDay(
  draft: OnboardingDraft,
  id: DayGroupId,
): OnboardingDraft {
  const current = hoursFor(draft).find((h) => h.id === id)?.isOpen ?? false;
  return { ...draft, dayOpen: { ...draft.dayOpen, [id]: !current } };
}

export function toggleService(
  draft: OnboardingDraft,
  name: string,
): OnboardingDraft {
  return {
    ...draft,
    serviceOff: { ...draft.serviceOff, [name]: !draft.serviceOff[name] },
  };
}

export function setPrice(
  draft: OnboardingDraft,
  name: string,
  text: string,
): OnboardingDraft {
  return { ...draft, prices: { ...draft.prices, [name]: sanitizePrice(text) } };
}

// ----- team -----

export function canAddTeamMember(team: TeamMember[], name: string): boolean {
  const clean = name.trim().toLowerCase();
  return (
    clean.length > 0 &&
    team.length < MAX_TEAM &&
    !team.some((m) => m.name.trim().toLowerCase() === clean)
  );
}

export function addTeamMember(
  draft: OnboardingDraft,
  name: string,
  title = '',
): OnboardingDraft {
  if (!canAddTeamMember(draft.team, name)) return draft;
  return {
    ...draft,
    team: [...draft.team, { name: name.trim(), title: title.trim() }],
  };
}

export function removeTeamMember(
  draft: OnboardingDraft,
  index: number,
): OnboardingDraft {
  return { ...draft, team: draft.team.filter((_, i) => i !== index) };
}

// ----- navigation -----

export function nextStep(step: Step): Step {
  return Math.min(STEP_COUNT, step + 1) as Step;
}

export function prevStep(step: Step): Step {
  return Math.max(1, step - 1) as Step;
}

/** Back is hidden on the first step and on the done screen. */
export const canGoBack = (step: Step) => step > 1 && step < STEP_COUNT;

/** The team step can be skipped ("Do this later"). */
export const canSkip = (step: Step) => step === 4;

/** Progress bar fill, 0..1 (the design fills step / 5). */
export const progressFraction = (step: Step) => step / STEP_COUNT;

export function canContinue(step: Step, draft: OnboardingDraft): boolean {
  if (step === 2) {
    return (
      draft.businessName.trim().length > 0 &&
      hoursFor(draft).some((h) => h.isOpen)
    );
  }
  return true;
}

// ----- submit -----

export function buildOnboardingRequest(
  draft: OnboardingDraft,
  ownerName: string | null,
): OnboardingRequest {
  return {
    business: { name: draft.businessName.trim() },
    owner_name: ownerName?.trim() || null,
    hours: hoursFor(draft).flatMap((h) =>
      h.isOpen
        ? (DAY_GROUPS.find((g) => g.id === h.id)?.weekdays ?? []).map(
            (weekday) => ({
              weekday,
              opens_at: h.opens,
              closes_at: h.closes,
            }),
          )
        : [],
    ),
    services: servicesFor(draft)
      .filter((s) => s.isOn)
      .map((s) => ({
        name: s.name,
        duration_minutes: s.durationMinutes,
        price_cents: (Number(s.priceText) || 0) * 100,
      })),
    team: draft.team.map((m) => ({
      name: m.name,
      title: m.title || null,
    })),
  };
}

/** Closing sentence on the done screen. */
export function summaryText(draft: OnboardingDraft): string {
  const noun =
    BUSINESS_TYPES.find((t) => t.id === draft.typeId)?.noun ?? 'business';
  const count = servicesFor(draft).filter((s) => s.isOn).length;
  const services = `${count} ${count === 1 ? 'service' : 'services'}`;
  return `Your ${noun} is set up with ${services}. Connect WhatsApp in Settings to get your first booking.`;
}
