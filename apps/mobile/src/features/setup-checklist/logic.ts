/**
 * The "Get set up" checklist: what is left to look at after onboarding built
 * the business from a template. Pure: the screen gathers the inputs, this
 * decides which items exist and which are done.
 */

export type ChecklistItemId =
  | 'whatsapp'
  | 'services'
  | 'hours'
  | 'team'
  | 'details'
  | 'rules'
  | 'voice'
  | 'notifications';

/** Where each item leads, in the order the list shows them. */
export const CHECKLIST_ORDER: readonly ChecklistItemId[] = [
  'whatsapp',
  'services',
  'hours',
  'team',
  'details',
  'rules',
  'voice',
  'notifications',
];

/** The Settings screen each item opens. */
export const CHECKLIST_ROUTES: Record<ChecklistItemId, string> = {
  whatsapp: '/settings/whatsapp',
  services: '/settings/services',
  hours: '/settings/operating-hours',
  team: '/settings/team',
  details: '/settings/business-details',
  rules: '/settings/booking-rules',
  voice: '/settings/voice',
  notifications: '/settings/notifications',
};

/** What the screen knows. `null` = still loading. */
export interface ChecklistInput {
  platform: 'ios' | 'android' | 'web';
  /** Clovie's WhatsApp number is connected (Nerova's setup state). */
  isWhatsAppConnected: boolean | null;
  servicesCount: number | null;
  hoursCount: number | null;
  /** Everyone who can take bookings, the owner included. */
  staffCount: number | null;
  /** The business has a phone or an address on file. */
  hasContactDetails: boolean | null;
  /** Hey Clovie (hands-free) is switched on. */
  isVoiceOn: boolean;
  /** The OS has granted notification permission; null until asked. */
  isPushGranted: boolean | null;
  /** Items the owner has opened and looked at. */
  reviewed: ReadonlySet<ChecklistItemId>;
}

export interface ChecklistItem {
  id: ChecklistItemId;
  isDone: boolean;
  /** Nothing works without it; the rest are recommended. */
  isRequired: boolean;
}

export interface Checklist {
  /** False until every value the list depends on has loaded; the story bubble stays hidden meanwhile. */
  isReady: boolean;
  items: ChecklistItem[];
  doneCount: number;
  /** All done: the story bubble and the Settings row disappear. */
  isComplete: boolean;
}

/**
 * Onboarding fills services, hours and the team from a template, so those
 * count as done only once the owner has opened them (`reviewed`) and there is
 * something there. Items with real data behind them (contact details, more
 * than one team member, notifications, hands-free voice) are done when the data
 * says so, or when the owner has looked and chosen to leave them.
 */
export function deriveChecklist(input: ChecklistInput): Checklist {
  const seen = (id: ChecklistItemId) => input.reviewed.has(id);
  const done: Record<ChecklistItemId, boolean> = {
    // Only the real connection counts; looking at it is not enough.
    whatsapp: input.isWhatsAppConnected === true,
    services: (input.servicesCount ?? 0) > 0 && seen('services'),
    hours: (input.hoursCount ?? 0) > 0 && seen('hours'),
    team: (input.staffCount ?? 0) > 1 || seen('team'),
    details: input.hasContactDetails === true || seen('details'),
    rules: seen('rules'),
    voice: input.isVoiceOn || seen('voice'),
    notifications: input.isPushGranted === true || seen('notifications'),
  };
  const ids = CHECKLIST_ORDER.filter(
    // Hey Clovie is an Android feature.
    (id) => id !== 'voice' || input.platform === 'android',
  );
  const items = ids.map((id) => ({
    id,
    isDone: done[id],
    isRequired: id === 'whatsapp',
  }));
  const doneCount = items.filter((i) => i.isDone).length;
  const isReady =
    input.isWhatsAppConnected !== null &&
    input.servicesCount !== null &&
    input.hoursCount !== null &&
    input.staffCount !== null &&
    input.hasContactDetails !== null &&
    input.isPushGranted !== null;
  return {
    isReady,
    items,
    doneCount,
    isComplete: isReady && doneCount === items.length,
  };
}

// ----- persistence of "reviewed" -----

export function serializeReviewed(reviewed: ReadonlySet<ChecklistItemId>) {
  return JSON.stringify([...reviewed]);
}

export function parseReviewed(raw: string | null): Set<ChecklistItemId> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return new Set();
    return new Set(
      CHECKLIST_ORDER.filter((id) => (value as unknown[]).includes(id)),
    );
  } catch {
    return new Set();
  }
}
