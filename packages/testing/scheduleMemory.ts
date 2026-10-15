/**
 * In-memory ScheduleRepository (special days, staff breaks, time off). It honours the same contract as the
 * Supabase implementation: unique special day per date, break overlap rules, SQLSTATE-mapped errors.
 */
import type { UUID } from '@booking/types';
import { mapDbError } from '@booking/features/lib/errors.ts';
import type {
  SpecialDayRow,
  StaffBreakRow,
  StaffRow,
  TimeOffRow,
} from '@booking/features/repositories/rows.ts';
import type { ScheduleRepository } from '@booking/features/repositories/types.ts';

export interface ScheduleTables {
  staff: StaffRow[];
  business_special_days: SpecialDayRow[];
  staff_breaks: StaffBreakRow[];
  staff_time_off: TimeOffRow[];
}

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const pgError = (code: string, message: string) => mapDbError({ code, message });
const clone = <T>(v: T): T => structuredClone(v);
const mins = (t: string) => {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
};
const normaliseWeekdays = (w: number[]) => [...new Set(w)].sort((a, b) => a - b);

function breaksOverlap(a: { start_time: string; end_time: string; weekdays: number[] }, b: typeof a): boolean {
  if (!(mins(a.start_time) < mins(b.end_time) && mins(b.start_time) < mins(a.end_time))) return false;
  const aw = a.weekdays.length ? a.weekdays : DAYS;
  const bw = b.weekdays.length ? b.weekdays : DAYS;
  return aw.some((d) => bw.includes(d));
}

const DUPLICATE_DATE = 'duplicate key value violates unique constraint "business_special_days_business_date_key"';

export function createMemorySchedule(tables: ScheduleTables, nextId: () => UUID): ScheduleRepository {
  const sameBusiness = <T extends { business_id: UUID }>(list: T[], businessId: UUID) =>
    list.filter((r) => r.business_id === businessId);
  const sortBreaks = (list: StaffBreakRow[]) =>
    list.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));

  return {
    async listSpecialDays(businessId, from, to) {
      return clone(
        sameBusiness(tables.business_special_days, businessId)
          .filter((d) => d.date >= from && d.date <= to)
          .sort((a, b) => a.date.localeCompare(b.date)),
      );
    },
    async getSpecialDay(businessId, id) {
      return clone(sameBusiness(tables.business_special_days, businessId).find((d) => d.id === id) ?? null);
    },
    async insertSpecialDay(businessId, values) {
      if (tables.business_special_days.some((d) => d.business_id === businessId && d.date === values.date)) {
        throw pgError('23505', DUPLICATE_DATE);
      }
      const row: SpecialDayRow = { id: nextId(), business_id: businessId, ...values };
      tables.business_special_days.push(row);
      return clone(row);
    },
    async updateSpecialDay(businessId, id, patch) {
      const row = sameBusiness(tables.business_special_days, businessId).find((d) => d.id === id);
      if (!row) return null;
      if (patch.date && tables.business_special_days.some((d) => d.business_id === businessId && d.date === patch.date && d.id !== id)) {
        throw pgError('23505', DUPLICATE_DATE);
      }
      Object.assign(row, patch);
      return clone(row);
    },
    async deleteSpecialDay(businessId, id) {
      const before = tables.business_special_days.length;
      tables.business_special_days = tables.business_special_days.filter((d) => !(d.business_id === businessId && d.id === id));
      return tables.business_special_days.length < before;
    },

    async listStaffBreaks(businessId, staffIds) {
      return clone(sortBreaks(sameBusiness(tables.staff_breaks, businessId).filter((b) => staffIds.includes(b.staff_id))));
    },
    async replaceStaffBreaks(businessId, staffId, breaks) {
      if (!tables.staff.some((s) => s.business_id === businessId && s.id === staffId)) {
        throw pgError('P0002', 'staff not found');
      }
      const normalised = breaks.map((b) => ({
        label: b.label.trim() || 'Break',
        start_time: b.start_time,
        end_time: b.end_time,
        weekdays: normaliseWeekdays(b.weekdays),
      }));
      const bad = normalised.some(
        (b) => mins(b.end_time) <= mins(b.start_time) || b.label.length > 60 || b.weekdays.some((d) => !DAYS.includes(d)),
      );
      if (bad) throw pgError('P0001', 'RULE:INVALID_BREAK:Each break needs start_time before end_time and weekdays 0-6');
      const key = (b: (typeof normalised)[number]) => `${b.label}|${mins(b.start_time)}|${mins(b.end_time)}|${b.weekdays.join(',')}`;
      const distinct = [...new Map(normalised.map((b) => [key(b), b])).values()];
      if (distinct.some((x, i) => distinct.some((y, j) => i < j && breaksOverlap(x, y)))) {
        throw pgError('P0001', 'RULE:OVERLAPPING_BREAKS:Breaks on the same day overlap');
      }
      const keep = new Set(distinct.map(key));
      tables.staff_breaks = tables.staff_breaks.filter((b) => b.staff_id !== staffId || keep.has(key(b)));
      const existing = new Set(tables.staff_breaks.filter((b) => b.staff_id === staffId).map(key));
      for (const b of distinct) {
        if (!existing.has(key(b))) tables.staff_breaks.push({ id: nextId(), business_id: businessId, staff_id: staffId, ...b });
      }
      return clone(sortBreaks(tables.staff_breaks.filter((b) => b.staff_id === staffId)));
    },

    async listTimeOff(businessId, from, to, staffIds) {
      return clone(
        sameBusiness(tables.staff_time_off, businessId)
          .filter((t) => t.starts_on <= to && t.ends_on >= from && (!staffIds || staffIds.includes(t.staff_id)))
          .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.id.localeCompare(b.id)),
      );
    },
    async getTimeOff(businessId, id) {
      return clone(sameBusiness(tables.staff_time_off, businessId).find((t) => t.id === id) ?? null);
    },
    async insertTimeOff(businessId, staffId, values) {
      if (!tables.staff.some((s) => s.business_id === businessId && s.id === staffId)) {
        throw pgError('23503', 'foreign key violation');
      }
      const row: TimeOffRow = { id: nextId(), business_id: businessId, staff_id: staffId, ...values };
      tables.staff_time_off.push(row);
      return clone(row);
    },
    async updateTimeOff(businessId, id, patch) {
      const row = sameBusiness(tables.staff_time_off, businessId).find((t) => t.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return clone(row);
    },
    async deleteTimeOff(businessId, id) {
      const before = tables.staff_time_off.length;
      tables.staff_time_off = tables.staff_time_off.filter((t) => !(t.business_id === businessId && t.id === id));
      return tables.staff_time_off.length < before;
    },
  };
}
