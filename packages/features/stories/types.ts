/** Shared shapes of the stories feature (docs/stories.md). The card shape is the API's StoryCardDTO. */
import type { StoryCardDTO, StoryEmotion, StoryKind, StoryTone } from '@booking/types';

export type { StoryCardDTO as StoryCard, StoryEmotion, StoryKind, StoryTone };

/** What an aggregator returns; null means "nothing worth a story". */
export interface GeneratedStory {
  tone: StoryTone;
  cards: StoryCardDTO[];
}

export type AppointmentStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

/** A booking with the client and service details the aggregators need. Instants are ISO-8601 UTC. */
export interface AppointmentFact {
  id: string;
  startsAt: string;
  createdAt: string;
  status: AppointmentStatus;
  clientId: string;
  clientName: string | null;
  serviceId: string;
  serviceName: string;
  priceCents: number;
  clientConfirmedAt: string | null;
}

export interface ClientFact {
  id: string;
  name: string | null;
  /** ISO-8601 UTC */
  createdAt: string;
}

/** Product update row as the selector sees it. */
export interface ProductUpdate {
  id: string;
  releasedAt: string;
  title: string;
  body: string;
  tone: StoryTone;
  tags: ProductUpdateTags;
  demo: string | null;
  status: 'draft' | 'approved';
  action: { label: string; deeplink: string } | null;
}

/** An empty or missing list means "any". */
export interface ProductUpdateTags {
  plans?: string[];
  roles?: string[];
  requires?: string[];
  platforms?: string[];
  minAppVersion?: string;
}
