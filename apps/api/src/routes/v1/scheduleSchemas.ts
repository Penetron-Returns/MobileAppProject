/** zod v4 request schemas for special days, breaks, time off, and the availability config/conflicts reads. */
import { z } from 'zod';

import { diffDays } from '@booking/features/lib/time.ts';
import { endAfterStart, isoDate, timeOfDay, uuid } from './schemas.ts';

const weekday = z.number().int().min(0).max(6);
const text = (max: number) => z.string().trim().max(max);

// ---------- special days ----------

const specialDayFields = {
  date: isoDate,
  name: text(120).min(1),
  kind: z.enum(['public_holiday', 'closure', 'special_hours']),
  is_closed: z.boolean().optional(),
  start_time: timeOfDay.nullable().optional(),
  end_time: timeOfDay.nullable().optional(),
};

export const createSpecialDaySchema = z.object(specialDayFields);
export const updateSpecialDaySchema = z.object(specialDayFields).partial();

export const suggestionsQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

// ---------- breaks ----------

const breakRow = z
  .object({
    label: text(60).optional(),
    start_time: timeOfDay,
    end_time: timeOfDay,
    weekdays: z.array(weekday).max(7).optional(),
  })
  .refine((b) => endAfterStart(b.start_time, b.end_time), 'end_time must be after start_time');

export const replaceBreaksSchema = z.object({ breaks: z.array(breakRow).max(20) });

// ---------- time off ----------

const MAX_TIME_OFF_DAYS = 366;

const timeOffFields = {
  starts_on: isoDate,
  ends_on: isoDate.optional(),
  start_time: timeOfDay.nullable().optional(),
  end_time: timeOfDay.nullable().optional(),
  reason: z.enum(['leave', 'sick', 'training', 'other']).optional(),
  note: text(500).nullable().optional(),
};

export const createTimeOffSchema = z.object(timeOffFields);
export const updateTimeOffSchema = z.object(timeOffFields).partial();

// ---------- reads ----------

const dateSpan = (q: { from: string; to: string }) => q.to >= q.from && diffDays(q.from, q.to) <= MAX_TIME_OFF_DAYS;
const SPAN_MESSAGE = `to must not be before from, and the range is at most ${MAX_TIME_OFF_DAYS} days`;

export const configQuerySchema = z.object({ from: isoDate, to: isoDate }).refine(dateSpan, SPAN_MESSAGE);

export const conflictsQuerySchema = z
  .object({
    staff_id: uuid.optional(),
    from: isoDate,
    /** Defaults to `from` (a single date) */
    to: isoDate.optional(),
    start_time: timeOfDay.optional(),
    end_time: timeOfDay.optional(),
    mode: z.enum(['closed', 'open_only']).default('closed'),
  })
  .transform((q) => ({ ...q, to: q.to ?? q.from }))
  .refine(dateSpan, SPAN_MESSAGE)
  .refine((q) => !!q.start_time === !!q.end_time, 'start_time and end_time must be set together')
  .refine((q) => !q.start_time || !q.end_time || endAfterStart(q.start_time, q.end_time), 'end_time must be after start_time')
  .refine((q) => q.mode === 'closed' || !!q.start_time, 'mode=open_only needs start_time and end_time');
