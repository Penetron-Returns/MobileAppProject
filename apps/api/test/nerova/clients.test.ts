import { describe, expect, it } from 'vitest';

import { declaredToolCapabilities } from '@booking/companion/connector/capabilities.ts';
import { matchTier, withinOneEdit } from '@booking/companion/connector/clientSearch.ts';
import definitions from '@booking/companion/connector/booking-connector.mcp-tools.json' with { type: 'json' };
import { nerovaHarness, type NerovaHarness } from './harness.ts';

const code = (r: { structuredContent: { code?: string } }) => r.structuredContent.code;

interface NewClient {
  name: string | null;
  phone: string;
  email?: string;
  seen?: string | null;
}

function addClients(h: NerovaHarness, clients: NewClient[], businessId = h.business.id) {
  return clients.map((c) => {
    const row = {
      id: h.repo.nextId(),
      business_id: businessId,
      phone_e164: c.phone,
      name: c.name,
      email: c.email ?? null,
      notes: null,
      tags: [],
      is_blocked: false,
      whatsapp_opt_in: true,
      first_seen_at: '2026-01-01T00:00:00.000Z',
      last_seen_at: c.seen ?? null,
    };
    h.repo.tables.clients.push(row);
    return row;
  });
}

/** Clients of the account's business; the seed already holds two. */
const owned = (h: NerovaHarness) => h.repo.tables.clients.filter((c) => c.business_id === h.business.id);
const SEEDED = 2;
const search = (h: NerovaHarness, args: Record<string, unknown>) => h.tool('clients_search', { accountId: h.business.id, ...args });
const names = (result: { structuredContent: { data: { name: string }[] } }) => result.structuredContent.data.map((c) => c.name);
const ids = (result: { structuredContent: { data: { externalClientId: string }[] } }) =>
  result.structuredContent.data.map((c) => c.externalClientId);

describe('clients_search by name', () => {
  it('matches a partial first or last name, case-insensitively', async () => {
    const h = nerovaHarness();
    addClients(h, [
      { name: 'Thandi Mokoena', phone: '+27820000001' },
      { name: 'Sipho Dlamini', phone: '+27820000002' },
    ]);
    expect(names(await search(h, { name: 'thand' }))).toEqual(['Thandi Mokoena']);
    expect(names(await search(h, { name: 'MOKO' }))).toEqual(['Thandi Mokoena']);
    expect(names(await search(h, { name: 'dlam' }))).toEqual(['Sipho Dlamini']);
    expect(names(await search(h, { name: 'zzz' }))).toEqual([]);
  });

  it('ignores diacritics in the query and in the stored name', async () => {
    const h = nerovaHarness();
    addClients(h, [
      { name: 'José Álvarez', phone: '+27820000001' },
      { name: 'Zoë Müller', phone: '+27820000002' },
    ]);
    expect(names(await search(h, { name: 'jose alvarez' }))).toEqual(['José Álvarez']);
    expect(names(await search(h, { name: 'ZOË' }))).toEqual(['Zoë Müller']);
    expect(names(await search(h, { name: 'muller' }))).toEqual(['Zoë Müller']);
    expect(names(await search(h, { name: 'JOSÉ' }))).toEqual(['José Álvarez']);
  });

  it('forgives a one-letter typo in words of four letters or more, but not in short words', async () => {
    const h = nerovaHarness();
    addClients(h, [
      { name: 'Thandi Mokoena', phone: '+27820000001' },
      { name: 'Ann Lee', phone: '+27820000002' },
    ]);
    expect(names(await search(h, { name: 'thandy' }))).toEqual(['Thandi Mokoena']);
    expect(names(await search(h, { name: 'mokoean' }))).toEqual(['Thandi Mokoena']);
    expect(names(await search(h, { name: 'anm' }))).toEqual([]);
  });

  it('ranks exact, then prefix, then contains, then fuzzy; ties go to the latest visit, then the name', async () => {
    const h = nerovaHarness();
    addClients(h, [
      { name: 'Anna Bell', phone: '+27820000001' }, // prefix, never seen
      { name: 'Joanna Cole', phone: '+27820000002', seen: '2026-09-01T10:00:00.000Z' }, // contains
      { name: 'Ann', phone: '+27820000003' }, // exact
      { name: 'Annie Fox', phone: '+27820000004', seen: '2026-09-20T10:00:00.000Z' }, // prefix, recent
      { name: 'Anne Hall', phone: '+27820000005', seen: '2026-09-10T10:00:00.000Z' }, // prefix, older
    ]);
    expect(names(await search(h, { name: 'ann' }))).toEqual(['Ann', 'Annie Fox', 'Anne Hall', 'Anna Bell', 'Joanna Cole']);

    const fuzzy = nerovaHarness();
    addClients(fuzzy, [
      { name: 'Thandy Zulu', phone: '+27820000002' },
      { name: 'Thandi Zulu', phone: '+27820000001' },
    ]);
    // "thandi" starts one name and is one edit from the other
    expect(names(await search(fuzzy, { name: 'thandi' }))).toEqual(['Thandi Zulu', 'Thandy Zulu']);
  });

  it('breaks equal ranks by name when nobody has visited', async () => {
    const h = nerovaHarness();
    addClients(h, [
      { name: 'Bea Smith', phone: '+27820000001' },
      { name: 'Amy Smith', phone: '+27820000002' },
    ]);
    expect(names(await search(h, { name: 'smith' }))).toEqual(['Amy Smith', 'Bea Smith']);
  });

  it('honours limit (default 10, at most 25) and rejects values outside 1-25', async () => {
    const h = nerovaHarness();
    addClients(
      h,
      Array.from({ length: 30 }, (_, i) => ({ name: `Client ${String(i).padStart(2, '0')}`, phone: `+2782000${String(i).padStart(4, '0')}` })),
    );
    expect((await search(h, { name: 'client' })).structuredContent.data).toHaveLength(10);
    expect((await search(h, { name: 'client', limit: 3 })).structuredContent.data).toHaveLength(3);
    expect((await search(h, { name: 'client', limit: 25 })).structuredContent.data).toHaveLength(25);
    expect(code(await search(h, { name: 'client', limit: 26 }))).toBe('invalid_request');
    expect(code(await search(h, { name: 'client', limit: 0 }))).toBe('invalid_request');
  });

  it("only sees the account's own clients", async () => {
    const h = nerovaHarness();
    addClients(h, [{ name: 'Thandi Mokoena', phone: '+27820000001' }]);
    addClients(h, [{ name: 'Thandi Other', phone: '+27820000009' }], h.freeBusinessId);
    expect(names(await search(h, { name: 'thandi' }))).toEqual(['Thandi Mokoena']);
    // a Free business is not an account at all
    expect(code(await h.tool('clients_search', { accountId: h.freeBusinessId, name: 'thandi' }))).toBe('not_found');
  });

  it('returns the contract fields, with lastVisitAt only when known', async () => {
    const h = nerovaHarness();
    const [seen, unseen] = addClients(h, [
      { name: 'Thandi Mokoena', phone: '+27820000001', email: 't@example.com', seen: '2026-09-20T10:00:00.000Z' },
      { name: 'Thandi Nel', phone: '+27820000002' },
    ]);
    const { data } = (await search(h, { name: 'thandi' })).structuredContent;
    expect(data).toEqual([
      { externalClientId: seen!.id, name: 'Thandi Mokoena', phone: '+27820000001', email: 't@example.com', lastVisitAt: '2026-09-20T10:00:00.000Z' },
      { externalClientId: unseen!.id, name: 'Thandi Nel', phone: '+27820000002' },
    ]);
  });

  it('conformance clients.search_by_name: the longest word of a found name, in upper case, limit 25, returns the client', async () => {
    const h = nerovaHarness();
    addClients(h, [
      { name: 'Thandiwe Mokoena-Dlamini', phone: '+27820000001' },
      { name: 'Thandi Mokoena', phone: '+27820000002' },
      { name: 'Zoë Müller', phone: '+27820000003' },
      { name: 'Ann Lee', phone: '+27820000004' },
    ]);
    const clients = h.repo.tables.clients.filter((c) => c.business_id === h.business.id);
    expect(clients.length).toBeGreaterThan(0);
    for (const row of clients) {
      const longest = row.name!.split(/\s+/).sort((a, b) => b.length - a.length)[0]!;
      const result = await search(h, { name: longest.toUpperCase(), limit: 25 });
      expect(ids(result), row.name!).toContain(row.id);
    }
  });
});

describe('clients_search by phone and email', () => {
  it('finds a client by phone in any format, scoped to the business', async () => {
    const h = nerovaHarness();
    const [thandi] = addClients(h, [{ name: 'Thandi Mokoena', phone: '+27820000001' }]);
    addClients(h, [{ name: 'Other Person', phone: '+27820000001' }], h.freeBusinessId);
    expect(ids(await search(h, { phone: '082 000 0001' }))).toEqual([thandi!.id]);
    expect((await search(h, { phone: '+27828888888' })).structuredContent.data).toEqual([]);
    expect(code(await search(h, { phone: 'not a phone' }))).toBe('invalid_request');
  });

  it('finds a client by email, ignoring case', async () => {
    const h = nerovaHarness();
    addClients(h, [{ name: 'Thandi Mokoena', phone: '+27820000001', email: 'Thandi.M@Example.com' }]);
    expect(names(await search(h, { email: 'thandi.m@example.COM' }))).toEqual(['Thandi Mokoena']);
    expect(names(await search(h, { email: 'nobody@example.com' }))).toEqual([]);
  });

  it('lists an exact phone match before name matches without repeating it', async () => {
    const h = nerovaHarness();
    addClients(h, [
      { name: 'Thandi Mokoena', phone: '+27820000001' },
      { name: 'Thandi Nel', phone: '+27820000002', seen: '2026-09-20T10:00:00.000Z' },
    ]);
    expect(names(await search(h, { name: 'thandi', phone: '+27820000001' }))).toEqual(['Thandi Mokoena', 'Thandi Nel']);
  });

  it('fails with invalid_request when no criteria are given', async () => {
    const h = nerovaHarness();
    expect(code(await search(h, {}))).toBe('invalid_request');
    expect(code(await search(h, { name: '   ', phone: '', email: ' ' }))).toBe('invalid_request');
    expect(code(await search(h, { name: '!!!' }))).toBe('invalid_request');
  });
});

describe('clients_create', () => {
  const create = (h: NerovaHarness, args: Record<string, unknown> = {}) =>
    h.tool('clients_create', { accountId: h.business.id, idempotencyKey: 'client-1', name: 'Walk In', phone: '+27821112222', ...args });

  it('creates a new client and finds it again by name', async () => {
    const h = nerovaHarness();
    const result = await create(h, { email: 'Walk@Example.com' });
    expect(result.isError).toBeUndefined();
    const client = result.structuredContent;
    expect(client).toMatchObject({ name: 'Walk In', phone: '+27821112222', email: 'walk@example.com' });
    expect(owned(h).filter((c) => c.phone_e164 === '+27821112222')).toHaveLength(1);
    expect(ids(await search(h, { name: 'walk' }))[0]).toBe(client.externalClientId);
  });

  it('returns the existing client when the phone matches, filling only blanks', async () => {
    const h = nerovaHarness();
    const [existing] = addClients(h, [{ name: 'Thandi Mokoena', phone: '+27821112222' }]);
    const result = await create(h, { name: 'Someone Else', phone: '082 111 2222', email: 'thandi@example.com' });
    expect(result.structuredContent).toMatchObject({ externalClientId: existing!.id, name: 'Thandi Mokoena', email: 'thandi@example.com' });
    expect(owned(h)).toHaveLength(SEEDED + 1);
  });

  it('returns the existing client when only the email matches', async () => {
    const h = nerovaHarness();
    const [existing] = addClients(h, [{ name: 'Thandi Mokoena', phone: '+27820000001', email: 'thandi@example.com' }]);
    const result = await create(h, { phone: undefined, email: 'THANDI@example.com' });
    expect(result.structuredContent.externalClientId).toBe(existing!.id);
    expect(owned(h)).toHaveLength(SEEDED + 1);
  });

  it('replays the first client for a repeated idempotencyKey and never creates twice', async () => {
    const h = nerovaHarness();
    const first = await create(h);
    const again = await create(h);
    expect(again.structuredContent.externalClientId).toBe(first.structuredContent.externalClientId);
    expect(owned(h)).toHaveLength(SEEDED + 1);
  });

  it('requires an idempotencyKey and a name', async () => {
    const h = nerovaHarness();
    expect(code(await h.tool('clients_create', { accountId: h.business.id, name: 'Walk In', phone: '+27821112222' }))).toBe('invalid_request');
    expect(code(await h.tool('clients_create', { accountId: h.business.id, idempotencyKey: 'k', phone: '+27821112222' }))).toBe('invalid_request');
    expect(owned(h)).toHaveLength(SEEDED);
  });

  it('needs a valid phone to create a new client', async () => {
    const h = nerovaHarness();
    expect(code(await create(h, { phone: undefined }))).toBe('invalid_request');
    expect(code(await create(h, { phone: undefined, email: 'new@example.com' }))).toBe('invalid_request');
    expect(code(await create(h, { phone: 'abc' }))).toBe('invalid_request');
    expect(owned(h)).toHaveLength(SEEDED);
  });

  it('is gated like the other writes: a Free business creates nothing', async () => {
    const h = nerovaHarness();
    expect(code(await h.tool('clients_create', { accountId: h.freeBusinessId, idempotencyKey: 'k', name: 'Walk In', phone: '+27821112222' }))).toBe('not_found');
    expect(owned(h)).toHaveLength(SEEDED);
  });
});

describe('client capability declaration', () => {
  const published = [...definitions.tools, ...definitions.optionalTools];

  it('declares ReadClients, SearchClientsByName and CreateClients from the published tools', () => {
    expect(declaredToolCapabilities(published)).toEqual(['ReadClients', 'SearchClientsByName', 'CreateClients']);
  });

  it('drops SearchClientsByName when clients_search has no name input, and everything when no client tool is published', () => {
    const noName = published.map((t) =>
      t.name === 'clients_search' ? { ...t, inputSchema: { type: 'object', properties: { phone: {}, email: {} } } } : t,
    );
    expect(declaredToolCapabilities(noName)).toEqual(['ReadClients', 'CreateClients']);
    expect(declaredToolCapabilities(definitions.tools)).toEqual([]);
  });

  it('lists the optional tools with the contract input schemas', () => {
    const search = definitions.optionalTools.find((t) => t.name === 'clients_search')!;
    expect(Object.keys((search.inputSchema as { properties: object }).properties)).toEqual(['accountId', 'phone', 'email', 'name', 'limit']);
    expect((search.inputSchema as { required: string[] }).required).toEqual(['accountId']);
    expect(search.annotations).toEqual({ readOnlyHint: true });
    const create = definitions.optionalTools.find((t) => t.name === 'clients_create')!;
    expect((create.inputSchema as { required: string[] }).required).toEqual(['accountId', 'idempotencyKey', 'name']);
    expect(create.annotations).toEqual({ readOnlyHint: false });
  });
});

describe('name matching helpers', () => {
  it.each([
    ['thandi mokoena', 'Thandi Mokoena', 0],
    ['thandi', 'Thandi Mokoena', 1],
    ['okoe', 'Thandi Mokoena', 2],
    ['thandy', 'Thandi Mokoena', 3],
    ['ann', 'Ana Lee', null],
  ])('ranks %s against %s as tier %s', (query, name, tier) => {
    expect(matchTier(query, name)).toBe(tier);
  });

  it.each([
    ['thandi', 'thandy', true],
    ['thandi', 'thnadi', true],
    ['thandi', 'thandii', true],
    ['thandi', 'thand', true],
    ['thandi', 'thanxy', false],
    ['abc', 'abcde', false],
  ])('withinOneEdit(%s, %s) is %s', (a, b, expected) => {
    expect(withinOneEdit(a, b)).toBe(expected);
  });
});
