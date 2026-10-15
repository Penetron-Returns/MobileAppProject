/** Pure usage maths and month helpers (no I/O, no clock). */
import type { BillingUsageDTO, ISODate, MonthKey, PlanKey, UsageState } from '@booking/types';
import { dateInZone } from '../../lib/time.ts';
import { NEAR_LIMIT_PERCENT, PLAN_CATALOG } from './planCatalog.ts';

export type UsageFigures = Pick<
  BillingUsageDTO,
  'included_jobs' | 'usage_percent' | 'usage_state' | 'extra_jobs' | 'extra_cost_cents'
>;

/**
 * Usage of one month. Over the allowance nothing is cut off: the extra jobs are priced instead.
 * 100% exactly is `near` (the allowance is used up but not exceeded); `over` starts at job allowance + 1.
 */
export function computeUsage(plan: PlanKey, completedJobs: number): UsageFigures {
  const { includedJobs, extraJobCents } = PLAN_CATALOG[plan];
  const jobs = Math.max(0, Math.trunc(completedJobs));
  if (includedJobs === null || includedJobs <= 0) {
    return { included_jobs: null, usage_percent: null, usage_state: 'normal', extra_jobs: 0, extra_cost_cents: 0 };
  }
  const extraJobs = Math.max(0, jobs - includedJobs);
  const state: UsageState = jobs > includedJobs ? 'over' : jobs * 100 >= includedJobs * NEAR_LIMIT_PERCENT ? 'near' : 'normal';
  return {
    included_jobs: includedJobs,
    usage_percent: Math.floor((jobs * 100) / includedJobs),
    usage_state: state,
    extra_jobs: extraJobs,
    extra_cost_cents: extraJobs * (extraJobCents ?? 0),
  };
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const isMonthKey = (value: string): boolean => MONTH_RE.test(value);

/** The calendar month containing `now` in the business timezone. */
export function currentMonth(now: Date, timeZone: string): MonthKey {
  return dateInZone(now, timeZone).slice(0, 7);
}

/** First day of the month, `YYYY-MM-01`. */
export const monthStart = (month: MonthKey): ISODate => `${month}-01`;

/** First day of the following month: when the count resets. */
export function nextMonthStart(month: MonthKey): ISODate {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
}
