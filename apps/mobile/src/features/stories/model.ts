/**
 * App-side story types, matching the backend contract (`StoryDTO` and
 * `StoryCardDTO`).
 * TODO: switch to `@booking/types` once the backend DTOs land in
 * `packages/types/api.ts`, and delete these.
 */
import type { ClovieEmotion } from '@/features/clovie-character';

/** `guide` is app-side only: the backend never sends it. */
export type StoryKind = 'brief' | 'clients' | 'business' | 'product' | 'guide';
export type StoryTone = 'positive' | 'neutral' | 'attention' | 'concern';
export type CountFormat = 'count' | 'money' | 'percent';

export interface StoryCardNumber {
  /** Money is integer cents. */
  value: number;
  format: CountFormat;
  unit?: string;
  /** ISO 4217 code for `money`; the business's currency. Defaults to USD. */
  currency?: string;
}

export interface StoryCardListItem {
  name: string;
  initials: string;
  detail: string;
}

export interface StoryCardAction {
  label: string;
  kind?: string;
  deeplink?: string;
}

export interface StoryCard {
  id: string;
  tone: StoryTone;
  kicker: string;
  headline: string;
  body?: string;
  number?: StoryCardNumber;
  list?: StoryCardListItem[];
  action?: StoryCardAction;
  emotion?: ClovieEmotion;
  demo?: 'undo' | 'names';
}

export interface Story {
  id: string;
  kind: StoryKind;
  title: string;
  tone: StoryTone;
  generatedAt: string;
  viewed: boolean;
  cards: StoryCard[];
}

/** A bubble's measured window frame, for the open and close shared-element feel. */
export interface OriginFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type StoryEventType =
  'open' | 'card_view' | 'complete' | 'skip' | 'close' | 'action';

export interface StoryEvent {
  type: StoryEventType;
  storyId: string;
  cardId?: string;
  cardIndex?: number;
}
