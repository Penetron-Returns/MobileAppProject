/** Row → DTO mapping for special days, breaks, time off and per-staff overrides. */
import type { SpecialDayDTO, StaffBreakDTO, StaffDayOverrideDTO, StaffTimeOffDTO } from '@booking/types';
import { normaliseTimeOfDay } from '../../lib/time.ts';
import type { OverrideRow, SpecialDayRow, StaffBreakRow, TimeOffRow } from '../../repositories/rows.ts';

const time = (value: string | null) => (value === null ? null : normaliseTimeOfDay(value));

export function toSpecialDayDTO(row: SpecialDayRow): SpecialDayDTO {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    kind: row.kind,
    is_closed: row.is_closed,
    start_time: time(row.start_time),
    end_time: time(row.end_time),
  };
}

export function toStaffBreakDTO(row: StaffBreakRow): StaffBreakDTO {
  return {
    id: row.id,
    staff_id: row.staff_id,
    label: row.label,
    start_time: normaliseTimeOfDay(row.start_time),
    end_time: normaliseTimeOfDay(row.end_time),
    weekdays: row.weekdays,
  };
}

export function toStaffTimeOffDTO(row: TimeOffRow): StaffTimeOffDTO {
  return {
    id: row.id,
    staff_id: row.staff_id,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    start_time: time(row.start_time),
    end_time: time(row.end_time),
    reason: row.reason,
    note: row.note,
  };
}

export function toStaffDayOverrideDTO(row: OverrideRow): StaffDayOverrideDTO {
  return {
    id: row.id,
    staff_id: row.staff_id,
    date: row.date,
    is_closed: row.is_closed,
    start_time: time(row.start_time),
    end_time: time(row.end_time),
    reason: row.reason,
  };
}
