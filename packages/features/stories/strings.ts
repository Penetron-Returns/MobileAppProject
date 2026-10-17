/**
 * Every English string a story can show, in one module. Templates are plain functions of
 * numbers and names the aggregators have already computed: no model writes facts at runtime.
 */
import type { StoryKind } from './types.ts';

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const STORY_TITLES: Record<StoryKind, string> = {
  brief: 'Brief',
  clients: 'Client updates',
  business: 'Business update',
};

export const FALLBACK_CLIENT_NAME = 'A client';

export const KICKERS = {
  today: 'Today',
  busiest: 'Busiest',
  confirm: 'Confirm',
  revenue: 'Revenue',
  newClients: 'New clients',
  lapsed: 'Not returned',
  cameBack: 'Welcome back',
  noShows: 'No-shows',
  popular: 'Popular',
  whatsNew: 'What’s new',
} as const;

export const brief = {
  bookings: (n: number) => `${n} ${plural(n, 'booking', 'bookings')} today`,
  bookingsUnit: 'bookings',
  firstUp: (time: string, firstName: string, service: string) => `First up: ${firstName} at ${time}, ${service}.`,
  busiest: (from: string, to: string) => `Busiest ${from}–${to}`,
  busiestBody: (n: number) => `${n} ${plural(n, 'booking', 'bookings')} in that window.`,
  unconfirmed: (n: number) => `${n} ${plural(n, 'client hasn’t', 'clients haven’t')} confirmed`,
  unconfirmedItem: (time: string, service: string) => `${time}, ${service}`,
  revenue: (money: string) => `${money} booked today`,
};

export const clients = {
  newClients: (n: number) => `${n} new ${plural(n, 'client', 'clients')}`,
  newClientsBody: 'Joined in the last 7 days.',
  newClientDetail: 'New client',
  lapsed: (n: number) => `${n} ${plural(n, 'client hasn’t', 'clients haven’t')} come back`,
  lapsedBody: (now: number, before: number) =>
    now > before ? `Up from ${before} last month.` : now < before ? `Down from ${before} last month.` : `Same as last month (${before}).`,
  lapsedDetail: (date: string) => `Last visit ${date}`,
  inviteBack: 'Invite them back',
  cameBack: (n: number) => `${n} ${plural(n, 'client is', 'clients are')} back`,
  cameBackDetail: (weeks: number) => `Back after ${weeks} weeks`,
};

export const business = {
  kicker: (span: 'week' | 'month') => (span === 'week' ? 'This week' : 'This month'),
  revenueUp: (money: string, span: 'week' | 'month') => `${money} booked this ${span}`,
  revenueBody: (pct: number, span: 'week' | 'month') =>
    `${pct >= 0 ? 'Up' : 'Down'} ${Math.abs(pct)}% on last ${span}.`,
  revenueFirst: (span: 'week' | 'month') => `Nothing was booked last ${span}, so there is no comparison yet.`,
  percentUnit: (span: 'week' | 'month') => `vs last ${span}`,
  noShows: (n: number, span: 'week' | 'month') => `${n} ${plural(n, 'no-show', 'no-shows')} this ${span}`,
  noShowDetail: (day: string, service: string) => `${day}, ${service}`,
  popular: (service: string) => `${service} was your most popular`,
  popularBody: (n: number, span: 'week' | 'month') => `${n} ${plural(n, 'booking', 'bookings')} this ${span}.`,
};
