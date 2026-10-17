import { describe, expect, it } from 'vitest';

import { declaredToolCapabilities } from '@booking/companion/connector/capabilities.ts';
import definitions from '@booking/companion/connector/booking-connector.mcp-tools.json' with { type: 'json' };
import { sast } from '../booking/fixtures.ts';
import { nerovaHarness } from './harness.ts';

type Harness = ReturnType<typeof nerovaHarness>;

const CONFIRMED_AT = '2026-09-29T08:00:00Z';
const CONFIRMED_AT_STORED = '2026-09-29T08:00:00.000Z';
const STAFF = { type: 'staff', id: 'user_staff' } as const;

const book = (h: Harness) =>
  h.ok('appointments_create', {
    accountId: h.business.id,
    idempotencyKey: 'c-1',
    externalServiceId: h.cut.id,
    externalStaffId: h.thandi.id,
    startTime: sast('09:00'),
    client: { name: 'Ada', phone: '+27820000000' },
  });

const confirm = (h: Harness, appointmentId: string, over: Record<string, unknown> = {}) =>
  h.tool('appointments_confirm', {
    accountId: h.business.id,
    appointmentId,
    idempotencyKey: 'wamid.1',
    confirmedAt: CONFIRMED_AT,
    channel: 'whatsapp',
    origin: { source: 'nerova', channel: 'reminder', conversationId: 'wacon_9' },
    ...over,
  });

const events = (h: Harness) => h.repo.tables.appointment_events.filter((e) => e.type === 'client_confirmed');
const row = (h: Harness, id: string) => h.repo.tables.appointments.find((a) => a.id === id);

describe('appointments_confirm', () => {
  it('sets the client-confirmed fields, records one client_confirmed event and returns the appointment', async () => {
    const h = nerovaHarness();
    const created = await book(h);
    const result = await confirm(h, created.externalAppointmentId);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(created);
    expect(row(h, created.externalAppointmentId)).toMatchObject({ client_confirmed_at: CONFIRMED_AT_STORED, client_confirmed_via: 'whatsapp' });
    expect(events(h)).toEqual([expect.objectContaining({ actor: 'nerova', actor_id: 'nerova:wacon_9' })]);
    expect(events(h)[0]?.payload).toMatchObject({ idempotency_key: `nerova:${h.business.id}:wamid.1` });
  });

  it('never notifies the client', async () => {
    const h = nerovaHarness();
    const created = await book(h);
    const before = h.changes.length;
    await confirm(h, created.externalAppointmentId);
    expect(h.changes).toHaveLength(before);
  });

  it('is idempotent on the message id: a replay returns the same result without a second write', async () => {
    const h = nerovaHarness();
    const created = await book(h);
    const first = await confirm(h, created.externalAppointmentId);
    const replay = await confirm(h, created.externalAppointmentId, { confirmedAt: '2026-09-30T01:00:00Z' });
    expect(replay.structuredContent).toEqual(first.structuredContent);
    expect(events(h)).toHaveLength(1);
    expect(row(h, created.externalAppointmentId)?.client_confirmed_at).toBe(CONFIRMED_AT_STORED);
  });

  const cancel = (h: Harness, id: string, extra: Record<string, unknown> = {}) =>
    h.ok('appointments_cancel', { accountId: h.business.id, appointmentId: id, origin: { source: 'nerova', channel: 'owner_chat', ...extra } });
  const nonConfirmed: [string, (h: Harness, id: string) => Promise<unknown>, string][] = [
    ['cancelled', (h, id) => cancel(h, id), 'Cancelled'],
    ['voided', (h, id) => cancel(h, id, { clientNotification: { mode: 'suppress' } }), 'Cancelled'],
    ['completed', (h, id) => h.container.booking.setAppointmentStatus(h.business.id, id, 'completed', STAFF), 'Completed'],
    ['no_show', (h, id) => h.container.booking.setAppointmentStatus(h.business.id, id, 'no_show', STAFF), 'NoShow'],
  ];

  it.each(nonConfirmed)('is a no-op, not an error, for a %s appointment', async (_name, move, wireStatus) => {
    const h = nerovaHarness();
    const created = await book(h);
    await move(h, created.externalAppointmentId);
    const result = await confirm(h, created.externalAppointmentId);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ externalAppointmentId: created.externalAppointmentId, status: wireStatus });
    expect(row(h, created.externalAppointmentId)).toMatchObject({ client_confirmed_at: null, client_confirmed_via: null });
    expect(events(h)).toHaveLength(0);
  });

  it('answers not_found for an unknown or malformed appointment and a non-entitled account', async () => {
    const h = nerovaHarness();
    const created = await book(h);
    expect(await confirm(h, '00000000-0000-4000-8000-000000000000')).toMatchObject({ isError: true, structuredContent: { code: 'not_found' } });
    expect(await confirm(h, 'nope')).toMatchObject({ isError: true, structuredContent: { code: 'not_found' } });
    expect(await confirm(h, created.externalAppointmentId, { accountId: h.freeBusinessId })).toMatchObject({ isError: true, structuredContent: { code: 'not_found' } });
    expect(row(h, created.externalAppointmentId)?.client_confirmed_at).toBeNull();
  });

  it('scopes to the account: an appointment of another entitled business is not_found', async () => {
    const h = nerovaHarness();
    const created = await book(h);
    const other = { ...h.business, id: h.repo.nextId(), clerk_org_id: 'org_other', slug: 'other', name: 'Other' };
    h.repo.tables.businesses.push(other);
    h.plans.set(other.id, 'starter');
    expect(await confirm(h, created.externalAppointmentId, { accountId: other.id })).toMatchObject({ isError: true, structuredContent: { code: 'not_found' } });
    expect(row(h, created.externalAppointmentId)?.client_confirmed_at).toBeNull();
  });

  it('answers invalid_request for a missing key, a bad instant, an unknown channel or a missing origin', async () => {
    const h = nerovaHarness();
    const created = await book(h);
    for (const over of [{ idempotencyKey: undefined }, { confirmedAt: 'yesterday' }, { channel: 'carrier-pigeon' }, { origin: undefined }]) {
      expect(await confirm(h, created.externalAppointmentId, over), JSON.stringify(over)).toMatchObject({ isError: true, structuredContent: { code: 'invalid_request' } });
    }
    expect(events(h)).toHaveLength(0);
  });

  it('keeps the appointment shape of appointments_get (no extra fields)', async () => {
    const h = nerovaHarness();
    const created = await book(h);
    await confirm(h, created.externalAppointmentId);
    expect(await h.ok('appointments_get', { accountId: h.business.id, appointmentId: created.externalAppointmentId })).toEqual(created);
  });
});

describe('ConfirmAppointments capability', () => {
  it('is published in tools/list and declared by the tool list, with no env flag', async () => {
    const h = nerovaHarness();
    const { body } = await h.rpc('tools/list');
    const tools = body.result.tools as { name: string; inputSchema: { required: string[] }; annotations: { readOnlyHint: boolean } }[];
    const tool = tools.find((t) => t.name === 'appointments_confirm');
    expect(tool?.annotations.readOnlyHint).toBe(false);
    expect(tool?.inputSchema.required).toEqual(['accountId', 'appointmentId', 'idempotencyKey', 'confirmedAt', 'channel', 'origin']);
    expect(declaredToolCapabilities(tools)).toContain('ConfirmAppointments');
    expect(definitions.optionalTools.map((t) => t.name)).toContain('appointments_confirm');
    expect(declaredToolCapabilities(definitions.tools)).not.toContain('ConfirmAppointments');
  });
});
