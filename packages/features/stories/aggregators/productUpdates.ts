/**
 * Product updates (docs/stories.md): which approved changelog entries one person sees. Pure: `now` is an input.
 * An entry is shown when it is approved, already released, the plan, role, platform and setup match its tags,
 * the installed app is new enough, and the person has not seen it. At most MAX_PRODUCT_UPDATES, newest first.
 */
import * as t from '../strings.ts';
import type { ProductUpdate, StoryCard } from '../types.ts';
import { compareVersions } from '../lib/version.ts';

export const MAX_PRODUCT_UPDATES = 3;

export interface ProductUpdateContext {
  plan: string;
  role: string;
  /** Setup flags that hold for this business: `companion`, `act_then_undo`, `voice`, ... */
  setup: ReadonlySet<string>;
  platform: string;
  /** Installed app version; null when the app did not send one */
  appVersion: string | null;
  seenIds: ReadonlySet<string>;
  now: Date;
}

const anyOf = (allowed: string[] | undefined, value: string) => !allowed || allowed.length === 0 || allowed.includes(value);

function appIsNewEnough(min: string | undefined, installed: string | null): boolean {
  if (!min) return true;
  if (!installed) return false;
  const order = compareVersions(installed, min);
  return order !== null && order >= 0;
}

export function selectProductUpdates(updates: readonly ProductUpdate[], ctx: ProductUpdateContext): ProductUpdate[] {
  return updates
    .filter((u) => {
      const tags = u.tags;
      return (
        u.status === 'approved' &&
        Date.parse(u.releasedAt) <= ctx.now.getTime() &&
        !ctx.seenIds.has(u.id) &&
        anyOf(tags.plans, ctx.plan) &&
        anyOf(tags.roles, ctx.role) &&
        anyOf(tags.platforms, ctx.platform) &&
        (tags.requires ?? []).every((flag) => ctx.setup.has(flag)) &&
        appIsNewEnough(tags.minAppVersion, ctx.appVersion)
      );
    })
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_PRODUCT_UPDATES);
}

/** Product update -> card. The card id is the update id, so the app can report what it has seen. */
export function productUpdateCard(update: ProductUpdate): StoryCard {
  return {
    id: update.id,
    tone: update.tone,
    kicker: t.KICKERS.whatsNew,
    headline: update.title,
    body: update.body,
    emotion: 'presenter',
    ...(update.action ? { action: { label: update.action.label, deeplink: update.action.deeplink } } : {}),
    ...(update.demo ? { demo: update.demo } : {}),
  };
}
