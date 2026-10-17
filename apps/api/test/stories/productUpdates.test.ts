import { describe, expect, it } from 'vitest';

import { productUpdateCard, selectProductUpdates, type ProductUpdateContext } from '@booking/features/stories/aggregators/productUpdates.ts';
import { compareVersions } from '@booking/features/stories/lib/version.ts';
import type { ProductUpdate, ProductUpdateTags } from '@booking/features/stories/types.ts';

const NOW = new Date('2026-10-28T10:00:00.000Z');

const update = (id: string, over: Partial<ProductUpdate> = {}): ProductUpdate => ({
  id,
  releasedAt: '2026-10-27T00:00:00.000Z',
  title: `Title ${id}`,
  body: `Body ${id}`,
  tone: 'neutral',
  tags: {},
  demo: null,
  status: 'approved',
  action: null,
  ...over,
});

const ctx = (over: Partial<Omit<ProductUpdateContext, 'setup' | 'seenIds'>> & { setup?: string[]; seen?: string[] } = {}): ProductUpdateContext => ({
  plan: 'growth',
  role: 'owner',
  platform: 'ios',
  appVersion: '1.4.0',
  now: NOW,
  ...over,
  setup: new Set(over.setup ?? ['companion', 'act_then_undo']),
  seenIds: new Set(over.seen ?? []),
});

const ids = (updates: ProductUpdate[], c: ProductUpdateContext) => selectProductUpdates(updates, c).map((u) => u.id);

describe('selectProductUpdates', () => {
  it.each([
    ['no tags = everyone', {}, {}, true],
    ['plan listed', { plans: ['growth', 'pro'] }, {}, true],
    ['plan not listed', { plans: ['pro'] }, {}, false],
    ['free plan not listed', { plans: ['starter', 'growth', 'pro'] }, { plan: 'free' }, false],
    ['role matches', { roles: ['owner'] }, {}, true],
    ['role does not match', { roles: ['owner'] }, { role: 'staff' }, false],
    ['platform matches', { platforms: ['ios'] }, {}, true],
    ['platform does not match', { platforms: ['android', 'web'] }, {}, false],
    ['all required setup present', { requires: ['companion', 'act_then_undo'] }, {}, true],
    ['one required setup missing', { requires: ['companion', 'voice'] }, {}, false],
    ['setup missing entirely', { requires: ['companion'] }, { setup: [] }, false],
  ] as [string, ProductUpdateTags, Record<string, unknown>, boolean][])('%s', (_name, tags, over, shown) => {
    expect(ids([update('a', { tags })], ctx(over))).toEqual(shown ? ['a'] : []);
  });

  describe('app version', () => {
    it.each([
      ['equal', '1.4.0', '1.4.0', true],
      ['newer patch', '1.4.1', '1.4.0', true],
      ['older minor', '1.3.9', '1.4.0', false],
      ['compares numbers, not strings (1.10 > 1.9)', '1.10.0', '1.9.0', true],
      ['compares numbers, not strings (1.9 < 1.10)', '1.9.0', '1.10.0', false],
      ['newer major', '2.0.0', '1.99.99', true],
      ['a short version is padded with zeros', '2', '1.9.9', true],
      ['a v prefix is accepted', 'v1.4.0', '1.4.0', true],
      ['a pre-release suffix is ignored', '1.4.0-beta.2', '1.4.0', true],
    ])('%s: installed %s, minimum %s -> %s', (_name, installed, minimum, shown) => {
      expect(ids([update('a', { tags: { minAppVersion: minimum } })], ctx({ appVersion: installed }))).toEqual(shown ? ['a'] : []);
    });

    it('hides an update with a minimum when the app sent no (or an unreadable) version, but shows one without', () => {
      expect(ids([update('a', { tags: { minAppVersion: '1.0.0' } })], ctx({ appVersion: null }))).toEqual([]);
      expect(ids([update('a', { tags: { minAppVersion: '1.0.0' } })], ctx({ appVersion: 'banana' }))).toEqual([]);
      expect(ids([update('a')], ctx({ appVersion: null }))).toEqual(['a']);
    });

    it('compareVersions returns null for non-versions', () => {
      expect(compareVersions('x', '1.0.0')).toBeNull();
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });
  });

  it('excludes drafts, unreleased entries and seen ones', () => {
    const updates = [
      update('draft', { status: 'draft' }),
      update('future', { releasedAt: '2026-10-28T10:00:00.001Z' }),
      update('released-now', { releasedAt: '2026-10-28T10:00:00.000Z' }),
      update('seen'),
      update('fresh'),
    ];
    expect(ids(updates, ctx({ seen: ['seen'] })).sort()).toEqual(['fresh', 'released-now']);
  });

  it('returns at most 3, newest first, ties by id', () => {
    const updates = [
      update('a', { releasedAt: '2026-10-01T00:00:00.000Z' }),
      update('b', { releasedAt: '2026-10-05T00:00:00.000Z' }),
      update('c', { releasedAt: '2026-10-03T00:00:00.000Z' }),
      update('e', { releasedAt: '2026-10-05T00:00:00.000Z' }),
      update('d', { releasedAt: '2026-10-04T00:00:00.000Z' }),
    ];
    expect(ids(updates, ctx())).toEqual(['b', 'e', 'd']);
  });

  it('is empty for an empty catalogue', () => {
    expect(ids([], ctx())).toEqual([]);
  });

  it('turns the seeded say-undo entry into a presenter card with its demo and action', () => {
    const card = productUpdateCard(
      update('say-undo', {
        title: 'Say ‘undo’',
        body: 'Clovie can now take back a booking.',
        tone: 'positive',
        demo: 'undo',
        action: { label: 'Try it', deeplink: 'clovie://voice' },
      }),
    );
    expect(card).toEqual({
      id: 'say-undo',
      tone: 'positive',
      kicker: 'What’s new',
      headline: 'Say ‘undo’',
      body: 'Clovie can now take back a booking.',
      emotion: 'presenter',
      action: { label: 'Try it', deeplink: 'clovie://voice' },
      demo: 'undo',
    });
  });

  it('leaves action and demo off a card that has none', () => {
    const card = productUpdateCard(update('plain'));
    expect(card).not.toHaveProperty('action');
    expect(card).not.toHaveProperty('demo');
    expect(card.emotion).toBe('presenter');
  });
});
