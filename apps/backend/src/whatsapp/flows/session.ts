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

/** Shown in place of the date heading when the chosen time vanished (the Flows have no error slot). */
export const FLOW_COPY = {
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

