/**
 * Public web-booking comparator API (the control arm of the study).
 * Mounted at /public behind idempotency(). Uses the exact same
 * BookingService (engine + RPCs) as the app and WhatsApp channels.
 * Only active services and bookable staff are exposed, with no PII.
 */
import { Hono, type MiddlewareHandler } from 'hono';

import type {
  AvailableDaysResponse,
  PublicBookingResponse,
  PublicBusinessResponse,
  StartAttemptResponse,
  UUID,
} from '@booking/types';
import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { upsertClient } from '@booking/features/clients/services/clients.ts';
import {
  completeAttempt,
  failAttempt,
  recordWebStep,
  requireOpenWebAttempt,
  startWebAttempt,
} from '@booking/features/bookings/services/attempts.ts';
import { bookingRules, toServiceDTO } from '@booking/features/bookings/lib/mappers.ts';
import { clientIp, createRateLimiter, type RateLimiter } from '@booking/features/bookings/lib/rateLimit.ts';
import type { BookingRepository } from '@booking/features/repositories/types.ts';
import type { BusinessRow } from '@booking/features/repositories/rows.ts';
import { AppError, notFound } from '@booking/features/lib/errors.ts';
import { parseJson, parseParam, parseQuery } from '../lib/validation.ts';
import type { AppEnv } from '../types.ts';
import { publicBillingRoutes } from './publicBilling.ts';
import { rpcIdempotencyKey, type Ctx } from './v1/context.ts';
import { attemptStepSchema, daysQuerySchema, publicBookingSchema, slotsQuerySchema, slugParam, uuid } from './v1/schemas.ts';

/** 60 POSTs per minute per client IP, per warm instance. */
export const PUBLIC_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

function rateLimit(limiter: RateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method === 'POST' && !limiter.hit(clientIp((name) => c.req.header(name)))) {
      throw new AppError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
    }
    await next();
  };
}

async function businessBySlug(repo: BookingRepository, c: Ctx): Promise<BusinessRow> {
  const business = await repo.getBusinessBySlug(parseParam(c, 'slug', slugParam).toLowerCase());
  if (!business) throw notFound('Business');
  return business;
}

/** Only active services are public; inactive ones look like they don't exist. */
async function requireActiveService(repo: BookingRepository, businessId: UUID, serviceId: UUID) {
  const service = await repo.getService(businessId, serviceId);
  if (!service || !service.is_active) throw notFound('Service');
  return service;
}

/** When staff selection is disabled, any requested staff id is ignored ("no preference"). */
const staffFilter = (business: BusinessRow, staffId: UUID | null | undefined) =>
  bookingRules(business).allow_staff_selection ? (staffId ?? null) : null;

export function createPublicRoutes(limiter: RateLimiter) {
  const routes = new Hono<AppEnv>();
  routes.use('*', rateLimit(limiter));
  routes.route('/billing', publicBillingRoutes);
  const repoOf = (c: Ctx) => getBookingRepository(c.get('container'));

  routes.get('/b/:slug', async (c) => {
    const repo = repoOf(c);
    const business = await businessBySlug(repo, c);
    const allowStaff = bookingRules(business).allow_staff_selection;
    const [services, staff, links] = await Promise.all([
      repo.listServices(business.id, { activeOnly: true }),
      repo.listStaff(business.id),
      repo.listStaffServices(business.id),
    ]);
    const bookable = staff.filter((s) => s.is_active && s.accepts_bookings);
    const activeServiceIds = new Set(services.map((s) => s.id));
    const staffServices: Record<UUID, UUID[]> = {};
    if (allowStaff) {
      for (const service of services) {
        staffServices[service.id] = bookable
          .filter((s) => links.some((l) => l.service_id === service.id && l.staff_id === s.id))
          .map((s) => s.id);
      }
    }
    const data: PublicBusinessResponse = {
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        timezone: business.timezone,
        currency: business.currency.trim(),
        logo_url: business.logo_url,
        address: business.address,
        allow_staff_selection: allowStaff,
      },
      services: services.map(toServiceDTO),
      staff: allowStaff
        ? bookable
            .filter((s) => links.some((l) => l.staff_id === s.id && activeServiceIds.has(l.service_id)))
            .map((s) => ({ id: s.id, name: s.name, title: s.title, photo_url: s.photo_url }))
        : [],
      staff_services: staffServices,
    };
    return c.json({ data });
  });

  routes.get('/b/:slug/availability/days', async (c) => {
    const repo = repoOf(c);
    const business = await businessBySlug(repo, c);
    const q = parseQuery(c, daysQuerySchema);
    await requireActiveService(repo, business.id, q.service_id);
    const days = await c.get('container').booking.listAvailableDays({
      businessId: business.id,
      serviceId: q.service_id,
      staffId: staffFilter(business, q.staff_id),
      from: q.from,
      to: q.to,
    });
    return c.json({ data: { days } satisfies AvailableDaysResponse });
  });

  routes.get('/b/:slug/availability/slots', async (c) => {
    const repo = repoOf(c);
    const business = await businessBySlug(repo, c);
    const q = parseQuery(c, slotsQuerySchema);
    await requireActiveService(repo, business.id, q.service_id);
    const data = await c.get('container').booking.listAvailableSlots({
      businessId: business.id,
      serviceId: q.service_id,
      staffId: staffFilter(business, q.staff_id),
      date: q.date,
    });
    return c.json({ data });
  });

  routes.post('/b/:slug/attempts', async (c) => {
    const repo = repoOf(c);
    const business = await businessBySlug(repo, c);
    const data: StartAttemptResponse = await startWebAttempt(repo, business.id, rpcIdempotencyKey(c, 'web'));
    return c.json({ data }, 201);
  });

  routes.post('/attempts/:id/steps', async (c) => {
    const id = parseParam(c, 'id', uuid);
    const { step } = await parseJson(c, attemptStepSchema);
    return c.json({ data: await recordWebStep(repoOf(c), id, step, new Date()) });
  });

  routes.post('/b/:slug/bookings', async (c) => {
    const repo = repoOf(c);
    const business = await businessBySlug(repo, c);
    const body = await parseJson(c, publicBookingSchema);
    const attempt = body.attempt_id ? await requireOpenWebAttempt(repo, body.attempt_id, business.id) : null;

    try {
      await requireActiveService(repo, business.id, body.service_id);
      // Never overwrite an existing client's details from an unauthenticated form.
      const client = await upsertClient(
        repo,
        business.id,
        { phone: body.phone, name: body.name, email: body.email ?? undefined },
        { onlyFillBlank: true },
      );
      const appointment = await c.get('container').booking.createAppointment({
        businessId: business.id,
        clientId: client.id,
        serviceId: body.service_id,
        staffId: staffFilter(business, body.staff_id),
        startsAt: body.starts_at,
        source: 'web',
        idempotencyKey: rpcIdempotencyKey(c, 'web'),
        actor: { type: 'customer', id: client.id },
        notifyCustomer: true,
      });
      if (attempt) await completeAttempt(repo, attempt, { appointmentId: appointment.id, clientId: client.id }, new Date());
      const data: PublicBookingResponse = {
        appointment: {
          id: appointment.id,
          starts_at: appointment.starts_at,
          ends_at: appointment.ends_at,
          status: appointment.status,
          service_id: appointment.service_id,
          staff_id: appointment.staff_id,
        },
      };
      return c.json({ data }, 201);
    } catch (err) {
      if (attempt) await failAttempt(repo, attempt, err);
      throw err;
    }
  });

  return routes;
}

/** The mounted instance's limiter (exported so tests can reset it). */
export const publicRateLimiter = createRateLimiter(PUBLIC_RATE_LIMIT);
export const publicRoutes = createPublicRoutes(publicRateLimiter);
