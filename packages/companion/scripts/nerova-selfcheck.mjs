#!/usr/bin/env node
/**
 * Self-check for the Nerova Booking MCP v1 connector (contract 2026-10-12).
 *
 * Mirrors the behavioural checks documented for `npx @nerova/connector-check`
 * (the MCP-capable checker is not on npm yet): handshake, the ten required
 * tools and their input schemas, bearer enforcement, accounts, services,
 * availability and, with --write, create + read-back, idempotent replay,
 * conflict, reschedule, cancel and error codes. Use a test account with --write.
 *
 *   node packages/companion/scripts/nerova-selfcheck.mjs <mcp-url> --credential <token> [--account-id <id>] [--write]
 */
const REQUIRED = [
  'accounts_list', 'accounts_get', 'services_list', 'staff_list', 'availability_search',
  'appointments_get', 'appointments_list', 'appointments_create', 'appointments_reschedule', 'appointments_cancel',
];

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--') && /^https?:/.test(a));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const credential = flag('credential') ?? process.env.NEROVA_CONNECTOR_CREDENTIAL;
const write = args.includes('--write');
if (!url || !credential) {
  console.error('Usage: nerova-selfcheck.mjs <mcp-url> --credential <token> [--account-id <id>] [--write]');
  process.exit(2);
}

let seq = 0;
async function rpc(method, params, token = credential) {
  seq += 1;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: seq, method, params }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const call = async (name, a) => (await rpc('tools/call', { name, arguments: a })).body.result;

const results = [];
async function check(id, fn) {
  try {
    await fn();
    results.push({ id, ok: true });
  } catch (error) {
    results.push({ id, ok: false, error: error.message });
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const ok = (r, what) => assert(r && !r.isError, `${what} failed: ${JSON.stringify(r?.structuredContent)}`);
const isoDay = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

let accountId = flag('account-id');
let tools = [];

await check('mcp.initialize', async () => {
  const { status, body } = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selfcheck', version: '1' } });
  assert(status === 200 && body.result?.capabilities?.tools, 'initialize must declare the tools capability');
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
});
await check('auth.rejects_bad_key', async () => {
  assert((await rpc('tools/list', undefined, 'wrong-token')).status === 401, 'wrong token must be HTTP 401');
  assert((await rpc('tools/list', undefined, null)).status === 401, 'missing token must be HTTP 401');
});
await check('mcp.required_tools', async () => {
  tools = (await rpc('tools/list')).body.result.tools;
  for (const name of REQUIRED) {
    const tool = tools.find((t) => t.name === name);
    assert(tool, `missing tool ${name}`);
    if (name !== 'accounts_list') assert(tool.inputSchema?.required?.includes('accountId'), `${name} must require accountId`);
    assert(tool.outputSchema, `${name} must publish an outputSchema`);
  }
  const extras = tools.filter((t) => !REQUIRED.includes(t.name));
  console.log(`extra tools: ${extras.length ? extras.map((t) => `${t.name} (readOnlyHint=${t.annotations?.readOnlyHint})`).join(', ') : 'none'}`);
});
await check('accounts.list', async () => {
  const r = await call('accounts_list', {});
  ok(r, 'accounts_list');
  assert(Array.isArray(r.structuredContent.data) && typeof r.structuredContent.hasMore === 'boolean', 'page needs data and hasMore');
  assert(r.structuredContent.data.length > 0, 'no account listed');
  accountId ??= r.structuredContent.data[0].id;
});
await check('accounts.get', async () => {
  const r = await call('accounts_get', { accountId });
  ok(r, 'accounts_get');
  const a = r.structuredContent;
  assert(a.id === accountId && a.displayName && a.timeZone && a.currency && a.locations?.length > 0, 'account shape');
});
await check('scoping.unknown_account', async () => {
  const r = await call('accounts_get', { accountId: '00000000-0000-4000-8000-00000000dead' });
  assert(r.isError && r.structuredContent.code === 'not_found', 'unknown account must be not_found');
});
let service;
let staff;
await check('services.list', async () => {
  const r = await call('services_list', { accountId });
  ok(r, 'services_list');
  service = r.structuredContent.data[0];
  assert(service?.externalServiceId && service.durationMinutes > 0, 'a service with an id and duration');
});
await check('staff.list', async () => {
  const r = await call('staff_list', { accountId });
  ok(r, 'staff_list');
  staff = r.structuredContent.data;
});
let slots = [];
await check('availability.search', async () => {
  for (let day = 0; day < 14 && slots.length === 0; day += 1) {
    const r = await call('availability_search', { accountId, serviceId: service.externalServiceId, start: `${isoDay(day)}T00:00:00Z`, end: `${isoDay(day + 1)}T00:00:00Z` });
    ok(r, 'availability_search');
    slots = r.structuredContent.data;
  }
  assert(slots.length >= 1, 'no open slot in the next 14 days (nothing to book)');
  for (const s of slots) assert(Date.parse(s.endTime) > Date.parse(s.startTime) && s.externalStaffId, 'slot shape');
});
await check('appointments.not_found', async () => {
  const r = await call('appointments_get', { accountId, appointmentId: 'appt_does_not_exist' });
  assert(r.isError && r.structuredContent.code === 'not_found', 'unknown appointment must be not_found');
});

if (write && slots.length > 0) {
  const key = `selfcheck-${Date.now()}`;
  const [first, second, third] = [slots[0], slots.find((s) => s.startTime !== slots[0].startTime), slots.at(-1)];
  const client = { name: 'Connector Check', phone: '+27820000001' };
  const base = { accountId, externalServiceId: service.externalServiceId, externalStaffId: first.externalStaffId, startTime: first.startTime, client, origin: { source: 'nerova', channel: 'flow', conversationId: 'selfcheck' } };
  let created;
  await check('lifecycle.create_verify', async () => {
    const r = await call('appointments_create', { ...base, idempotencyKey: key });
    ok(r, 'appointments_create');
    created = r.structuredContent;
    const read = await call('appointments_get', { accountId, appointmentId: created.externalAppointmentId });
    ok(read, 'appointments_get');
    assert(read.structuredContent.status === 'Scheduled' && Date.parse(read.structuredContent.startTime) === Date.parse(first.startTime), 'write must be visible on read-back');
  });
  await check('lifecycle.idempotent_replay', async () => {
    const r = await call('appointments_create', { ...base, idempotencyKey: key });
    ok(r, 'replay');
    assert(r.structuredContent.externalAppointmentId === created.externalAppointmentId, 'replay must return the same appointment');
  });
  await check('errors.conflict', async () => {
    const r = await call('appointments_create', { ...base, idempotencyKey: `${key}-clash`, client: { name: 'Other', phone: '+27820000002' } });
    assert(r.isError && r.structuredContent.code === 'conflict', 'a taken slot must be conflict');
  });
  await check('errors.invalid_request', async () => {
    const { idempotencyKey: _omit, ...noKey } = { ...base, idempotencyKey: undefined };
    const r = await call('appointments_create', noKey);
    assert(r.isError && r.structuredContent.code === 'invalid_request', 'missing idempotencyKey must be invalid_request');
  });
  await check('lifecycle.reschedule_verify', async () => {
    const target = second ?? third;
    const r = await call('appointments_reschedule', { accountId, appointmentId: created.externalAppointmentId, newStartTime: target.startTime, newExternalStaffId: target.externalStaffId });
    ok(r, 'appointments_reschedule');
    const read = await call('appointments_get', { accountId, appointmentId: created.externalAppointmentId });
    assert(Date.parse(read.structuredContent.startTime) === Date.parse(target.startTime), 'reschedule must be visible on read-back');
  });
  await check('lifecycle.cancel_verify', async () => {
    const r = await call('appointments_cancel', { accountId, appointmentId: created.externalAppointmentId, reason: 'selfcheck cleanup' });
    ok(r, 'appointments_cancel');
    const read = await call('appointments_get', { accountId, appointmentId: created.externalAppointmentId });
    assert(read.structuredContent.status === 'Cancelled', 'cancel must be visible on read-back');
  });
  await check('appointments.list_window', async () => {
    const r = await call('appointments_list', { accountId, from: `${isoDay(0)}T00:00:00Z`, to: `${isoDay(30)}T00:00:00Z` });
    ok(r, 'appointments_list');
    assert(Array.isArray(r.structuredContent.items), 'items array');
  });
} else if (!write) {
  console.log('read-only run: pass --write to also create, reschedule and cancel a test appointment');
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}${r.ok ? '' : `: ${r.error}`}`);
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed${failed.length ? `: fix ${failed.map((f) => f.id).join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
