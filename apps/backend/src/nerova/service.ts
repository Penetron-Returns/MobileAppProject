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

import type { AppointmentDTO, UUID } from '../../../../packages/shared/api.ts';
import { upsertClient } from '../booking/admin.ts';
import type { BookingRepository } from '../booking/repository.ts';
import { AppError } from '../lib/errors.ts';
import { tryNormalizePhone } from '../lib/phone.ts';
import { addDays, dateInZone, dateRange } from '../lib/time.ts';
import type { Actor, BookingService, EntitlementService } from '../ports.ts';
import type { ToolArgs } from './args.ts';
import { connectorNotFound, invalidRequest } from './errors.ts';
import {
  fromWireStatus,
  toAccount,
  toAppointment,
  toAppointmentListItem,
  toOpeningHours,
  toService,
  toStaff,
} from './mappers.ts';

export interface NerovaConnectorDeps {
  booking: BookingService;
  entitlements: EntitlementService;
  repo: BookingRepository;
  clock: () => Date;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;
const MAX_WINDOW_DAYS = 31;
const DEFAULT_PAGE = 50;
const EXCEPTION_HORIZON_DAYS = 180;
/** Days of availability computed at once: each one is several queries, and a window can span 31 days. */
const AVAILABILITY_CONCURRENCY = 4;

/** Like Promise.all(items.map(fn)) but with at most `limit` calls in flight; results keep the input order. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

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

/** Origin channels that mean the owner is directing Pip (Nerova's `owner_chat` widget session). */
const OWNER_CHANNELS: ReadonlySet<string> = new Set(['owner', 'owner_chat']);

/**
 * Changes are held to the cancellation window by default: only an origin that positively says the owner is
 * directing Pip skips it, so a missing or vague origin can never bypass the owner's rule for a customer.
 */
const holdToWindow = (origin?: { channel?: string }) => !(origin?.channel && OWNER_CHANNELS.has(origin.channel));

export function createNerovaConnectorService(deps: NerovaConnectorDeps) {
  const { booking, entitlements, repo } = deps;

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

  async function accountView(businessId: UUID) {
    const business = await booking.getBusiness(businessId);
    const today = dateInZone(deps.clock(), business.timezone);
    const [hours, overrides] = await Promise.all([
      repo.listBusinessHours(businessId),
      repo.listOverrides(businessId, today, addDays(today, EXCEPTION_HORIZON_DAYS)),
    ]);
    return toAccount(business, toOpeningHours(business.id, hours, overrides));
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
      return accountView(await requireAccount(args.accountId));
    },

    async servicesList(args: ToolArgs<'services_list'>) {
      const businessId = await requireAccount(args.accountId);
      const [business, services] = await Promise.all([
        booking.getBusiness(businessId),
        booking.listServices(businessId, { activeOnly: true }),
      ]);
      return { data: services.map((s) => toService(s, business.currency)) };
    },

    async staffList(args: ToolArgs<'staff_list'>) {
      const businessId = await requireAccount(args.accountId);
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
    },

    async availabilitySearch(args: ToolArgs<'availability_search'>) {
      const businessId = await requireAccount(args.accountId);
      const start = Date.parse(args.start);
      const end = Date.parse(args.end);
      if (end <= start) throw invalidRequest('end must be after start');
      if (end - start > MAX_WINDOW_DAYS * DAY_MS) throw invalidRequest(`window is at most ${MAX_WINDOW_DAYS} days`);
      if (!isUuid(args.serviceId)) throw connectorNotFound('Service');
      if (args.staffId && (!isUuid(args.staffId) || !(await repo.getStaff(businessId, args.staffId)))) {
        throw connectorNotFound('Staff');
      }
      const { timezone } = await booking.getBusiness(businessId);
      const dates = dateRange(dateInZone(new Date(start), timezone), dateInZone(new Date(end - 1), timezone));
      const now = deps.clock();
      const days = await mapWithConcurrency(dates, AVAILABILITY_CONCURRENCY, (date) =>
        booking.listAvailableSlots({ businessId, serviceId: args.serviceId, staffId: args.staffId, date, now }),
      );
      const data = days
        .flatMap((day) => day.slots)
        .filter((slot) => Date.parse(slot.starts_at) >= start && Date.parse(slot.ends_at) <= end)
        .flatMap((slot) =>
          slot.staff_ids.map((staffId) => ({ startTime: slot.starts_at, endTime: slot.ends_at, externalStaffId: staffId })),
        );
      return { data };
    },

    async appointmentsGet(args: ToolArgs<'appointments_get'>) {
      const businessId = await requireAccount(args.accountId);
      return toAppointment(await appointmentOf(businessId, args.appointmentId));
    },

    async appointmentsList(args: ToolArgs<'appointments_list'>) {
      const businessId = await requireAccount(args.accountId);
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
      const [services, staff, clients] = await Promise.all([
        repo.listServices(businessId),
        repo.listStaff(businessId),
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
    },

    async appointmentsCreate(args: ToolArgs<'appointments_create'>) {
      const businessId = await requireAccount(args.accountId);
      // The key is globally unique in the database, so it is scoped to the account here.
      const idempotencyKey = `nerova:${businessId}:${args.idempotencyKey}`;
      const replay = await repo.findAppointmentByIdempotencyKey(businessId, idempotencyKey);
      if (replay) return toAppointment(await appointmentOf(businessId, replay.id));

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
          // Pip talks to the customer itself; our WhatsApp menu is not part of paid plans.
          notifyCustomer: false,
          now: deps.clock(),
        });
        return toAppointment(appointment);
      } catch (error) {
        // A retry racing its twin loses on the exclusion constraint; the twin's booking is the answer, not a conflict.
        if (error instanceof AppError && error.code === 'SLOT_UNAVAILABLE') {
          const winner = await repo.findAppointmentByIdempotencyKey(businessId, idempotencyKey);
          if (winner) return toAppointment(await appointmentOf(businessId, winner.id));
        }
        throw error;
      }
    },

    async appointmentsReschedule(args: ToolArgs<'appointments_reschedule'>) {
      const businessId = await requireAccount(args.accountId);
      const current = await appointmentOf(businessId, args.appointmentId);
      if (args.newExternalStaffId && !isUuid(args.newExternalStaffId)) throw connectorNotFound('Staff');
      const appointment = await booking.rescheduleAppointment({
        businessId,
        appointmentId: current.id,
        startsAt: args.newStartTime,
        staffId: args.newExternalStaffId ?? null,
        actor: nerovaActor(args.origin),
        notifyCustomer: false,
        enforceCancellationWindow: holdToWindow(args.origin),
        now: deps.clock(),
      });
      return toAppointment(appointment);
    },

    async appointmentsCancel(args: ToolArgs<'appointments_cancel'>) {
      const businessId = await requireAccount(args.accountId);
      const current = await appointmentOf(businessId, args.appointmentId);
      const appointment = await booking.cancelAppointment({
        businessId,
        appointmentId: current.id,
        actor: nerovaActor(args.origin),
        reason: args.reason ?? null,
        notifyCustomer: false,
        enforceCancellationWindow: holdToWindow(args.origin),
        now: deps.clock(),
      });
      return toAppointment(appointment);
    },
  };
}

export type NerovaConnectorService = ReturnType<typeof createNerovaConnectorService>;
