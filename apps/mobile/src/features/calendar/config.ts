import type { AvailabilityConfigResponse } from '@booking/types';

import type {
  BreakRow,
  HoursRow,
  OverrideRow,
  RuleRow,
  SpecialDayRow,
  TimeOffRow,
} from './spans';

/** The schedule tables the grid reads, flattened from GET /v1/availability/config. */
export interface CalendarSchedule {
  hours: HoursRow[];
  specialDays: SpecialDayRow[];
  rules: RuleRow[];
  overrides: OverrideRow[];
  breaks: BreakRow[];
  timeOff: TimeOffRow[];
}

export function toCalendarSchedule(
  config: AvailabilityConfigResponse,
): CalendarSchedule {
  return {
    hours: config.business_hours,
    specialDays: config.special_days,
    rules: config.staff.flatMap((s) =>
      s.rules.map((r) => ({ staff_id: s.staff_id, ...r })),
    ),
    overrides: config.staff.flatMap((s) => s.overrides),
    breaks: config.staff.flatMap((s) => s.breaks),
    timeOff: config.staff.flatMap((s) => s.time_off),
  };
}
