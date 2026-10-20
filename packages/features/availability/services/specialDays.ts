/**
 * Business special days: a named date that is closed (public holiday, closure) or has replacement hours.
 * Stored in business_special_days (one per date). A closed special day blocks bookings the moment it exists;
 * appointments already on that date are left alone (see conflicts.ts for the preview).
 */
import type {
  CreateSpecialDayRequest,
  SpecialDayDTO,
  SpecialDayKind,
  SpecialDaySuggestionsResponse,
  UpdateSpecialDayRequest,
  UUID,
} from '@booking/types';
import { AppError, notFound } from '../../lib/errors.ts';
import { normaliseTimeOfDay, parseTimeOfDay } from '../../lib/time.ts';
import type { BookingRepository, SpecialDayValues } from '../../repositories/types.ts';
import { southAfricanPublicHolidays } from '../lib/holidays.ts';
import { toSpecialDayDTO } from '../lib/mappers.ts';

const invalid = (message: string) => new AppError('VALIDATION_FAILED', message);

/** Fills defaults and checks the cross-field rules the database also enforces. */
export function resolveSpecialDay(req: CreateSpecialDayRequest): SpecialDayValues {
  const name = req.name.trim();
  if (!name) throw invalid('name is required');
  const isClosed = req.is_closed ?? req.kind !== 'special_hours';
  if (req.kind === 'closure' && !isClosed) throw invalid('A closure must be closed');
  if (req.kind === 'special_hours' && isClosed) throw invalid('Special hours must be open');
  if (isClosed) {
    return { date: req.date, name, kind: req.kind, is_closed: true, start_time: null, end_time: null };
  }
  if (!req.start_time || !req.end_time || parseTimeOfDay(req.end_time) <= parseTimeOfDay(req.start_time)) {
    throw invalid('An open special day needs start_time before end_time');
  }
  return {
    date: req.date,
    name,
    kind: req.kind,
    is_closed: false,
    start_time: normaliseTimeOfDay(req.start_time),
    end_time: normaliseTimeOfDay(req.end_time),
  };
}

async function assertDateFree(repo: BookingRepository, businessId: UUID, date: string, exceptId?: UUID) {
  const [existing] = (await repo.listSpecialDays(businessId, date, date)).filter((d) => d.id !== exceptId);
  if (existing) throw new AppError('VALIDATION_FAILED', 'A special day already exists on this date', { special_day_id: existing.id });
}

export async function createSpecialDay(
  repo: BookingRepository,
  businessId: UUID,
  req: CreateSpecialDayRequest,
): Promise<SpecialDayDTO> {
  const values = resolveSpecialDay(req);
  await assertDateFree(repo, businessId, values.date);
  return toSpecialDayDTO(await repo.insertSpecialDay(businessId, values));
}

/** The merged result must be a valid special day, exactly as on create. */
export async function updateSpecialDay(
  repo: BookingRepository,
  businessId: UUID,
  specialDayId: UUID,
  req: UpdateSpecialDayRequest,
): Promise<SpecialDayDTO> {
  const current = await repo.getSpecialDay(businessId, specialDayId);
  if (!current) throw notFound('Special day');
  const kind: SpecialDayKind = req.kind ?? current.kind;
  const switchedKind = req.kind !== undefined && req.kind !== current.kind;
  const values = resolveSpecialDay({
    date: req.date ?? current.date,
    name: req.name ?? current.name,
    kind,
    // A new kind picks its own default unless the caller said so
    is_closed: req.is_closed ?? (switchedKind ? undefined : current.is_closed),
    start_time: req.start_time !== undefined ? req.start_time : current.start_time,
    end_time: req.end_time !== undefined ? req.end_time : current.end_time,
  });
  if (values.date !== current.date) await assertDateFree(repo, businessId, values.date, specialDayId);
  const row = await repo.updateSpecialDay(businessId, specialDayId, values);
  if (!row) throw notFound('Special day');
  return toSpecialDayDTO(row);
}

export async function deleteSpecialDay(repo: BookingRepository, businessId: UUID, specialDayId: UUID): Promise<{ id: UUID }> {
  if (!(await repo.deleteSpecialDay(businessId, specialDayId))) throw notFound('Special day');
  return { id: specialDayId };
}

/** South African public holidays for `year`, each marked when a special day already exists on that date. */
export async function suggestSpecialDays(
  repo: BookingRepository,
  businessId: UUID,
  year: number,
): Promise<SpecialDaySuggestionsResponse> {
  const existing = new Map((await repo.listSpecialDays(businessId, `${year}-01-01`, `${year}-12-31`)).map((d) => [d.date, d.id]));
  return {
    year,
    suggestions: southAfricanPublicHolidays(year).map((h) => ({
      date: h.date,
      name: h.name,
      kind: 'public_holiday' as const,
      is_closed: true as const,
      observed_for: h.observed_for,
      added: existing.has(h.date),
      special_day_id: existing.get(h.date) ?? null,
    })),
  };
}
