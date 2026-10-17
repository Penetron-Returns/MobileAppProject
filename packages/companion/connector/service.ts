/**
 * NerovaConnectorService: the booking-system side of Nerova Booking MCP v1.
 * It maps the ten tools onto existing ports (BookingService, EntitlementService)
 * and read-only repository lookups. It never writes tables: every write goes
 * through BookingService (create_appointment / reschedule / cancel RPCs, so the
 * exclusion constraint, idempotency and appointment_events apply unchanged).
 *
 * An "account" is a business entitled to `companion`. Anything else (a Free
 * business, an unknown or malformed id) is `not_found`, never revealed.
 */
import { Buffer } from 'node:buffer';

import type { AppointmentDTO, UUID } from '@booking/types';
import { upsertClient } from '@booking/features/clients/services/clients.ts';
import type { ClientRow } from '@booking/features/repositories/rows.ts';
import type { BookingRepository } from '@booking/features/repositories/types.ts';
import { AppError } from '@booking/features/lib/errors.ts';
import { tryNormalizePhone } from '@booking/features/lib/phone.ts';
import { addDays, dateInZone } from '@booking/features/lib/time.ts';
import type { Actor, BookingService, EntitlementService } from '@booking/features/ports.ts';
import type { ToolArgs } from './args.ts';
import { candidatePatterns, nameWords, NAME_CANDIDATE_CAP, rankClientsByName } from './clientSearch.ts';
import { connectorNotFound, invalidRequest } from './errors.ts';
import {
  fromWireStatus,
  toAccount,
  toAppointment,
  toAppointmentListItem,
  toClient,
  toOpeningHours,
  toService,
  toStaff,
} from './mappers.ts';

export interface NerovaConnectorDeps {
  /** Live booking service: every write, and appointment reads */
  booking: BookingService;
  /**
   * Booking service over a read-through cache of the static data (business, catalogue, staff, hours), used for
   * the account, services and availability reads. Defaults to `booking`. Writes never use it.
   */
  readBooking?: BookingService;
  entitlements: EntitlementService;
  repo: BookingRepository;
  clock: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
const MAX_WINDOW_DAYS = 31;
const DEFAULT_PAGE = 50;
const EXCEPTION_HORIZON_DAYS = 180;
const DEFAULT_CLIENT_LIMIT = 10;
/** A hold is the undo window plus a few seconds; anything further out is a malformed request. */
const MAX_HOLD_MS = DAY_MS;

const isUuid = (value: string | undefined): value is UUID => !!value && UUID_RE.test(value);

/** Opaque keyset cursor for appointments_list: base64url({ s: startsAt, i: id }). */
const encodeCursor = (a: AppointmentDTO) => Buffer.from(JSON.stringify({ s: a.starts_at, i: a.id })).toString('base64url');
function decodeCursor(cursor: string): { startsAt: string; id: UUID } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { s?: unknown; i?: unknown };
    if (typeof parsed.s === 'string' && !Number.isNaN(Date.parse(parsed.s)) && typeof parsed.i === 'string' && isUuid(parsed.i)) {
      return { startsAt: new Date(parsed.s).toISOString(), id: parsed.i };
    }
  } catch {
    // fall through
  }
  throw invalidRequest('cursor is not valid');
}

/** Audit identity: the connection, plus Nerova's opaque conversation id when it sent one. */
function nerovaActor(origin?: { conversationId?: string }): Actor {
  return { type: 'nerova', id: origin?.conversationId ? `nerova:${origin.conversationId}` : 'nerova' };
}

/**
 * Origin channels that are not a customer and so skip the cancellation window: `owner`, `owner_chat` and
 * `owner_whatsapp` (the owner directing Pip) and `system` / `conformance` (Nerova's own jobs and its connection
 * certification, which books the soonest slot and then moves and cancels it). Nerova sends `owner_chat` or
 * `owner_whatsapp` for owner changes and never `owner`; it stays because it is harmless.
 */
const WINDOW_EXEMPT_CHANNELS: ReadonlySet<string> = new Set(['owner', 'owner_chat', 'owner_whatsapp', 'system', 'conformance']);

/**
 * Changes are held to the cancellation window by default. Customer channels (`whatsapp`, `voice`, `flow`, ...)
 * and a missing or unrecognised origin are held to it; only a channel in WINDOW_EXEMPT_CHANNELS skips it, so a
 * vague origin can never bypass the owner's rule for a customer. Lead time and the booking horizon are part of
 * availability, which stays truthful for every channel, and creates are never exempted from availability or the
 * exclusion constraint.
 */
const holdToWindow = (origin?: { channel?: string }) => !(origin?.channel && WINDOW_EXEMPT_CHANNELS.has(origin.channel));

type ClientNotification = NonNullable<NonNullable<ToolArgs<'appointments_create'>['origin']>['clientNotification']>;

/** `hold` is only valid on create and `suppress` only on cancel; `until` must be near. Returns the validated hold or void request. */
function readClientNotification(origin: { clientNotification?: ClientNotification } | undefined, tool: 'create' | 'cancel', now: Date) {
  const request = origin?.clientNotification;
  if (!request) return {};
  if (request.mode === 'hold') {
    if (tool !== 'create') throw invalidRequest('origin.clientNotification.mode "hold" is only valid on appointments_create');
    if (Date.parse(request.until) - now.getTime() > MAX_HOLD_MS) throw invalidRequest('origin.clientNotification.until is too far in the future');
    return { holdUntil: request.until };
  }
  if (tool !== 'cancel') throw invalidRequest('origin.clientNotification.mode "suppress" is only valid on appointments_cancel');
  return { voided: true };
}

export function createNerovaConnectorService(deps: NerovaConnectorDeps) {
  const { booking, entitlements, repo } = deps;
  const reads = deps.readBooking ?? booking;
  const wire = toAppointment;

  /** The business behind an account id, or not_found when it is unknown, malformed or not on a companion plan. */
  async function requireAccount(accountId: string): Promise<UUID> {
    if (!isUuid(accountId)) throw connectorNotFound('Account');
    try {
      if (!(await entitlements.hasFeature(accountId, 'companion'))) throw connectorNotFound('Account');
    } catch (error) {
      if (error instanceof AppError && error.code === 'NOT_FOUND') throw connectorNotFound('Account');
      throw error;
    }
    return accountId;
  }

  /**
   * Runs a read while the plan gate is checked, so the two round trips overlap instead of queueing. The gate
   * decides the outcome: for a non-entitled or unknown account the read result is discarded and never returned.
   * Only for reads; a write always waits for the gate (requireAccount) first.
   */
  async function gated<T>(accountId: string, read: (businessId: UUID) => Promise<T>): Promise<T> {
    if (!isUuid(accountId)) throw connectorNotFound('Account');
    const result = read(accountId);
    result.catch(() => undefined); // the gate may reject first; this keeps the discarded read from going unhandled
    await requireAccount(accountId);
    return result;
  }

  async function accountView(businessId: UUID) {
    const business = await reads.getBusiness(businessId);
    const today = dateInZone(deps.clock(), business.timezone);
    const [hours, specialDays] = await Promise.all([
      repo.listBusinessHours(businessId),
      repo.listSpecialDays(businessId, today, addDays(today, EXCEPTION_HORIZON_DAYS)),
    ]);
    return toAccount(business, toOpeningHours(business.id, hours, specialDays));
  }

  async function searchAvailability(businessId: UUID, args: ToolArgs<'availability_search'>) {
    const start = Date.parse(args.start);
    const end = Date.parse(args.end);
    if (end <= start) throw invalidRequest('end must be after start');
    if (end - start > MAX_WINDOW_DAYS * DAY_MS) throw invalidRequest(`window is at most ${MAX_WINDOW_DAYS} days`);
    if (!isUuid(args.serviceId)) throw connectorNotFound('Service');
    if (args.staffId && !isUuid(args.staffId)) throw connectorNotFound('Staff');
    // Warm the cached reads the range load needs while the business and staff checks are in flight, so a cold
    // call takes two round-trip stages instead of four. Failures surface from the real reads below.
    void Promise.allSettled([
      repo.getService(businessId, args.serviceId),
      repo.listStaff(businessId),
      repo.listStaffServices(businessId),
      repo.listBusinessHours(businessId),
    ]);
    const [staff, { timezone }] = await Promise.all([
      args.staffId ? repo.getStaff(businessId, args.staffId) : Promise.resolve(null),
      reads.getBusiness(businessId),
    ]);
    if (args.staffId && !staff) throw connectorNotFound('Staff');
    // One schedule load for the whole window; the slots per date are computed in memory.
    const days = await reads.listAvailableSlotsForRange({
      businessId,
      serviceId: args.serviceId,
      staffId: args.staffId,
      from: dateInZone(new Date(start), timezone),
      to: dateInZone(new Date(end - 1), timezone),
      now: deps.clock(),
    });
    const data = days
      .flatMap((day) => day.slots)
      .filter((slot) => Date.parse(slot.starts_at) >= start && Date.parse(slot.ends_at) <= end)
      .flatMap((slot) =>
        slot.staff_ids.map((staffId) => ({ startTime: slot.starts_at, endTime: slot.ends_at, externalStaffId: staffId })),
      );
    return { data };
  }

  async function appointmentOf(businessId: UUID, appointmentId: string): Promise<AppointmentDTO> {
    const appointment = isUuid(appointmentId) ? await booking.getAppointment(businessId, appointmentId) : null;
    if (!appointment) throw connectorNotFound('Appointment');
    return appointment;
  }

  async function resolveClient(businessId: UUID, client: ToolArgs<'appointments_create'>['client']): Promise<UUID> {
    if (client.externalClientId) {
      if (!isUuid(client.externalClientId) || !(await repo.getClient(businessId, client.externalClientId))) {
        throw connectorNotFound('Client');
      }
      return client.externalClientId;
    }
    if (!client.phone) throw invalidRequest('client.phone (E.164) or client.externalClientId is required');
    if (!tryNormalizePhone(client.phone)) throw invalidRequest('client.phone is not a valid phone number');
    const row = await upsertClient(repo, businessId, { phone: client.phone, name: client.name, email: client.email }, { onlyFillBlank: true });
    return row.id;
  }

  async function listAppointmentsPage(businessId: UUID, args: ToolArgs<'appointments_list'>) {
    const from = Date.parse(args.from);
    const to = Date.parse(args.to);
    if (to <= from) throw invalidRequest('to must be after from');
    if (to - from > MAX_WINDOW_DAYS * DAY_MS) throw invalidRequest(`window is at most ${MAX_WINDOW_DAYS} days`);
    const limit = args.limit ?? DEFAULT_PAGE;
    const after = args.cursor ? decodeCursor(args.cursor) : undefined;

    let clientId = args.clientId;
    if (args.clientPhone) {
      const phone = tryNormalizePhone(args.clientPhone);
      if (!phone) throw invalidRequest('clientPhone is not a valid phone number');
      clientId = (await repo.findClientByPhone(businessId, phone))?.id;
      if (!clientId) return { items: [] };
    }
    // Filters that name something this account does not have match nothing.
    if ((args.staffId && !isUuid(args.staffId)) || (clientId && !isUuid(clientId))) return { items: [] };

    // Names come from the cached catalogue; start them now so they overlap the appointment query.
    const names = Promise.all([repo.listServices(businessId), repo.listStaff(businessId)]);
    names.catch(() => undefined);
    const rows = await booking.listAppointments({
      businessId,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      staffId: args.staffId,
      clientId,
      status: args.status ? fromWireStatus(args.status) : undefined,
      after,
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const [[services, staff], clients] = await Promise.all([
      names,
      repo.listClientsByIds(businessId, [...new Set(page.map((a) => a.client_id))]),
    ]);
    const lookups = {
      services: new Map(services.map((s) => [s.id, s.name])),
      staff: new Map(staff.map((s) => [s.id, s.name])),
      clients: new Map(clients.map((c) => [c.id, c])),
    };
    const last = page[page.length - 1];
    return {
      items: page.map((a) => toAppointmentListItem(a, lookups)),
      ...(rows.length > limit && last ? { nextCursor: encodeCursor(last) } : {}),
    };
  }

  /** Phone and email are exact matches (best first), then the ranked name matches; each client once. */
  async function searchClients(businessId: UUID, args: ToolArgs<'clients_search'>) {
    const name = args.name?.trim();
    const email = args.email?.trim().toLowerCase();
    const rawPhone = args.phone?.trim();
    if (!name && !email && !rawPhone) throw invalidRequest('phone, email or name is required');
    const phone = rawPhone ? tryNormalizePhone(rawPhone) : null;
    if (rawPhone && !phone) throw invalidRequest('phone is not a valid phone number');
    if (name && nameWords(name).length === 0) throw invalidRequest('name must contain letters or digits');

    const [byPhone, byEmail, byName] = await Promise.all([
      phone ? repo.findClientByPhone(businessId, phone) : null,
      email ? repo.findClientByEmail(businessId, email) : null,
      name ? repo.listClientsByNamePatterns(businessId, candidatePatterns(name), NAME_CANDIDATE_CAP) : [],
    ]);
    const ranked = name ? rankClientsByName(name, byName) : [];
    const found = [byPhone, byEmail, ...ranked].filter((c): c is NonNullable<typeof c> => c !== null);
    const unique = found.filter((c, i) => found.findIndex((other) => other.id === c.id) === i);
    return { data: await toClientsWithVisits(businessId, unique.slice(0, args.limit ?? DEFAULT_CLIENT_LIMIT)) };
  }

  /** Contract clients with lastVisitAt from completed past appointments: one batched query for all of them. */
  async function toClientsWithVisits(businessId: UUID, clients: Pick<ClientRow, 'id' | 'name' | 'phone_e164' | 'email'>[]) {
    const visits = await repo.lastCompletedVisitByClient(businessId, clients.map((c) => c.id), deps.clock().toISOString());
    return clients.map((c) => toClient(c, visits[c.id]));
  }

  /**
   * An existing client (by phone, then email) is returned as it is; otherwise one is created through the same upsert
   * as appointments_create. Idempotent by construction: the same key and details always resolve to the same client.
   */
  async function createClient(businessId: UUID, args: ToolArgs<'clients_create'>) {
    const rawPhone = args.phone?.trim();
    const phone = rawPhone ? tryNormalizePhone(rawPhone) : null;
    if (rawPhone && !phone) throw invalidRequest('phone is not a valid phone number');
    const email = args.email?.trim().toLowerCase() || undefined;
    if (!phone && !email) throw invalidRequest('phone or email is required');

    if (phone && (await repo.findClientByPhone(businessId, phone))) {
      const row = await upsertClient(repo, businessId, { phone, name: args.name.trim(), email }, { onlyFillBlank: true });
      return (await toClientsWithVisits(businessId, [row]))[0]!;
    }
    const byEmail = email ? await repo.findClientByEmail(businessId, email) : null;
    if (byEmail) return (await toClientsWithVisits(businessId, [byEmail]))[0]!;
    if (!phone) throw invalidRequest('phone is required to create a new client');
    return toClient(await upsertClient(repo, businessId, { phone, name: args.name.trim(), email }, { onlyFillBlank: true }));
  }

  return {
    async accountsList(args: ToolArgs<'accounts_list'>) {
      const limit = args.limit ?? DEFAULT_PAGE;
      if (args.cursor && !isUuid(args.cursor)) throw invalidRequest('cursor is not valid');
      const ids = await entitlements.listBusinessIdsWithFeature('companion', { after: args.cursor, limit: limit + 1 });
      const page = ids.slice(0, limit);
      const data = await Promise.all(page.map(accountView));
      const hasMore = ids.length > limit;
      return { data, hasMore, ...(hasMore ? { nextCursor: page[page.length - 1] } : {}) };
    },

    async accountsGet(args: ToolArgs<'accounts_get'>) {
      return gated(args.accountId, accountView);
    },

    async servicesList(args: ToolArgs<'services_list'>) {
      return gated(args.accountId, async (businessId) => {
        const [business, services] = await Promise.all([
          reads.getBusiness(businessId),
          reads.listServices(businessId, { activeOnly: true }),
        ]);
        return { data: services.map((s) => toService(s, business.currency)) };
      });
    },

    async staffList(args: ToolArgs<'staff_list'>) {
      return gated(args.accountId, async (businessId) => {
        const [staff, links, services] = await Promise.all([
          repo.listStaff(businessId),
          repo.listStaffServices(businessId),
          repo.listServices(businessId, { activeOnly: true }),
        ]);
        const active = new Set(services.map((s) => s.id));
        const data = staff
          .filter((s) => s.is_active && s.accepts_bookings)
          .map((s) => toStaff(s, links.filter((l) => l.staff_id === s.id && active.has(l.service_id)).map((l) => l.service_id)));
        return { data };
      });
    },

    async availabilitySearch(args: ToolArgs<'availability_search'>) {
      return gated(args.accountId, (businessId) => searchAvailability(businessId, args));
    },

    async appointmentsGet(args: ToolArgs<'appointments_get'>) {
      return gated(args.accountId, async (businessId) => wire(await appointmentOf(businessId, args.appointmentId)));
    },

    async appointmentsList(args: ToolArgs<'appointments_list'>) {
      return gated(args.accountId, (businessId) => listAppointmentsPage(businessId, args));
    },

    async appointmentsCreate(args: ToolArgs<'appointments_create'>) {
      const businessId = await requireAccount(args.accountId);
      // The key is globally unique in the database, so it is scoped to the account here.
      const idempotencyKey = `nerova:${businessId}:${args.idempotencyKey}`;
      const replay = await repo.findAppointmentByIdempotencyKey(businessId, idempotencyKey);
      if (replay) return wire(await appointmentOf(businessId, replay.id));

      const { holdUntil } = readClientNotification(args.origin, 'create', deps.clock());
      if (!isUuid(args.externalServiceId)) throw connectorNotFound('Service');
      if (!isUuid(args.externalStaffId)) throw connectorNotFound('Staff');
      const clientId = await resolveClient(businessId, args.client);
      const notes = [args.notes, args.reason ? `Reason: ${args.reason}` : undefined].filter(Boolean).join('\n') || null;
      try {
        const appointment = await booking.createAppointment({
          businessId,
          clientId,
          serviceId: args.externalServiceId,
          staffId: args.externalStaffId,
          startsAt: args.startTime,
          source: 'nerova',
          idempotencyKey,
          actor: nerovaActor(args.origin),
          notes,
          // Without a hold Pip talks to the customer itself. With `hold` WE are the only sender: the created
          // message goes out at `until` (hold job) if the booking is still confirmed, never before.
          notifyCustomer: !!holdUntil,
          ...(holdUntil ? { holdClientNotificationUntil: holdUntil } : {}),
          now: deps.clock(),
        });
        return wire(appointment);
      } catch (error) {
        // A retry racing its twin loses on the exclusion constraint; the twin's booking is the answer, not a conflict.
        if (error instanceof AppError && error.code === 'SLOT_UNAVAILABLE') {
          const winner = await repo.findAppointmentByIdempotencyKey(businessId, idempotencyKey);
          if (winner) return wire(await appointmentOf(businessId, winner.id));
        }
        throw error;
      }
    },

    async clientsSearch(args: ToolArgs<'clients_search'>) {
      return gated(args.accountId, (businessId) => searchClients(businessId, args));
    },

    /** Gated like every write (the plan check first); the clients table's audit trigger records the insert. */
    async clientsCreate(args: ToolArgs<'clients_create'>) {
      return createClient(await requireAccount(args.accountId), args);
    },

    async appointmentsReschedule(args: ToolArgs<'appointments_reschedule'>) {
      const businessId = await requireAccount(args.accountId);
      // The booking service loads and scopes the appointment itself (NOT_FOUND maps to not_found), so no pre-read.
      if (!isUuid(args.appointmentId)) throw connectorNotFound('Appointment');
      if (args.newExternalStaffId && !isUuid(args.newExternalStaffId)) throw connectorNotFound('Staff');
      const appointment = await booking.rescheduleAppointment({
        businessId,
        appointmentId: args.appointmentId,
        startsAt: args.newStartTime,
        staffId: args.newExternalStaffId ?? null,
        actor: nerovaActor(args.origin),
        notifyCustomer: false,
        enforceCancellationWindow: holdToWindow(args.origin),
        now: deps.clock(),
      });
      return wire(appointment);
    },

    /**
     * Client tapped "Confirm" on a Nerova reminder (`appointments_confirm`, ConfirmAppointments capability).
     * The key is the reminder's WhatsApp message id, scoped to the account like create's. Idempotent, and a no-op
     * (the appointment comes back unchanged, not an error) unless it is still confirmed (Scheduled); both are enforced
     * by BookingService.confirmByClient and the confirm_appointment_by_client RPC, which also writes the
     * client_confirmed event. This path never messages the client.
     */
    async confirmAppointment(args: ToolArgs<'appointments_confirm'>) {
      const businessId = await requireAccount(args.accountId);
      if (!isUuid(args.appointmentId)) throw connectorNotFound('Appointment');
      const appointment = await booking.confirmByClient({
        businessId,
        appointmentId: args.appointmentId,
        confirmedAt: args.confirmedAt,
        via: args.channel,
        actor: nerovaActor(args.origin),
        idempotencyKey: `nerova:${businessId}:${args.idempotencyKey}`,
      });
      return wire(appointment);
    },

    async appointmentsCancel(args: ToolArgs<'appointments_cancel'>) {
      const businessId = await requireAccount(args.accountId);
      const { voided } = readClientNotification(args.origin, 'cancel', deps.clock());
      if (!isUuid(args.appointmentId)) throw connectorNotFound('Appointment');
      const appointment = await booking.cancelAppointment({
        businessId,
        appointmentId: args.appointmentId,
        actor: nerovaActor(args.origin),
        reason: voided ? null : (args.reason ?? null),
        notifyCustomer: false,
        ...(voided ? { voided } : {}),
        enforceCancellationWindow: holdToWindow(args.origin),
        now: deps.clock(),
      });
      return wire(appointment);
    },
  };
}

export type NerovaConnectorService = ReturnType<typeof createNerovaConnectorService>;
