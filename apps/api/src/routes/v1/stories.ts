/**
 * Clovie stories (docs/stories.md). Owners and staff, Clerk session; every call is scoped to the caller's business.
 *   GET  /v1/stories                  Brief, Client updates, Business update, then Product updates
 *   POST /v1/stories/:id/view         { lastCardIndex }
 *   POST /v1/product-updates/view     { ids }
 *   POST /v1/stories/events           { events } (up to 50; ids, kind and card index only, never personal data)
 * The app sends `X-App-Version` and `X-Platform` so product updates can be filtered by what it can show.
 */
import { Hono } from 'hono';
import { z } from 'zod';

import type { StoriesResponseDTO } from '@booking/types';
import type { StoriesCaller } from '@booking/features/stories/ports.ts';
import { parseJson, parseParam } from '../../lib/validation.ts';
import type { AppEnv } from '../../types.ts';

export const storiesRoutes = new Hono<AppEnv>();

const PLATFORMS = new Set(['ios', 'android', 'web']);
const MAX_CARD_INDEX = 50;

const viewSchema = z.strictObject({ lastCardIndex: z.number().int().min(0).max(MAX_CARD_INDEX) });
const productViewSchema = z.strictObject({ ids: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/)).min(1).max(20) });
const eventSchema = z.strictObject({
  storyKind: z.enum(['brief', 'clients', 'business', 'product']),
  storyId: z.uuid().nullish(),
  cardIndex: z.number().int().min(0).max(MAX_CARD_INDEX),
  event: z.enum(['open', 'card_view', 'complete', 'skip', 'close', 'action']),
  at: z.iso.datetime({ offset: true }).optional(),
});
const eventsSchema = z.strictObject({ events: z.array(eventSchema).min(1).max(50) });

function callerOf(auth: AppEnv['Variables']['auth']): StoriesCaller {
  return { businessId: auth.businessId, userId: auth.userId, role: auth.role };
}

storiesRoutes.get('/stories', async (c) => {
  const platform = (c.req.header('x-platform') ?? '').trim().toLowerCase();
  const version = (c.req.header('x-app-version') ?? '').trim();
  const data: StoriesResponseDTO = await c.get('container').stories.getStories(callerOf(c.get('auth')), {
    platform: PLATFORMS.has(platform) ? platform : 'unknown',
    appVersion: version === '' || version.length > 32 ? null : version,
  });
  c.get('logger').info('stories_listed', { stories: data.stories.length, product_updates: data.productUpdates.cards.length });
  return c.json({ data });
});

storiesRoutes.post('/stories/events', async (c) => {
  const { events } = await parseJson(c, eventsSchema);
  const result = await c.get('container').stories.recordEvents(callerOf(c.get('auth')), events);
  return c.json({ data: result }, 201);
});

storiesRoutes.post('/stories/:id/view', async (c) => {
  const id = parseParam(c, 'id', z.uuid());
  const { lastCardIndex } = await parseJson(c, viewSchema);
  await c.get('container').stories.markViewed(callerOf(c.get('auth')), id, lastCardIndex);
  return c.json({ data: { viewed: true } });
});

storiesRoutes.post('/product-updates/view', async (c) => {
  const { ids } = await parseJson(c, productViewSchema);
  await c.get('container').stories.markProductUpdatesViewed(callerOf(c.get('auth')), ids);
  return c.json({ data: { viewed: true } });
});
