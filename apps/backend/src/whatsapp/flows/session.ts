/** Shared types and response helpers for the Flow data_exchange handlers. */
import type { BusinessDTO } from '../../../../../packages/shared/api.ts';
import type { WaDeps } from '../deps.ts';
import type { ClientRow, ConversationRow } from '../repo.ts';
import type { FlowTokenClaims } from './token.ts';

export interface FlowRequest {
  version?: string;
  action?: string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
}

export type FlowResult = { status: 200; body: Record<string, unknown> } | { status: 427 };

/** Data API version the Flows declare (`data_api_version`) and every response echoes. */
export const FLOW_DATA_VERSION = '3.0';

export const FLOW_COPY = {
  noDates: 'Sorry, there are no open dates for this right now.',
  noSlots: 'Sorry, there are no times left on that day. Please pick another date.',
  slotTaken: 'Sorry, that slot was just taken. Please pick another time.',
  slotTakenBack: 'Sorry, that slot was just taken. Please go back and pick another time.',
  noSlotsBack: 'Sorry, there are no times left on that day. Please go back and pick another date.',
  invalid: 'Please check your selection and try again.',
  failed: "Sorry, we couldn't complete that. Please try again.",
  window: "Sorry, this booking can't be changed online this close to the start time.",
  /** Booking flow: shown in place of the date heading when the chosen time vanished. */
  timeTaken: 'Sorry, that time was just taken. Please pick another time.',
} as const;

export interface Session {
  deps: WaDeps;
  token: string;
  claims: FlowTokenClaims;
  conv: ConversationRow;
  client: ClientRow;
  business: BusinessDTO;
  now: Date;
}

export const screen = (name: string, data: Record<string, unknown>): FlowResult => ({
  status: 200,
  body: { version: FLOW_DATA_VERSION, screen: name, data },
});

/**
 * Flow routing is forward-only, so every error keeps the customer on the
 * screen they submitted, with an `error_message`.
 */
export const stay = (name: string | undefined, error: string): FlowResult => screen(name ?? 'SERVICE', { error_message: error });
