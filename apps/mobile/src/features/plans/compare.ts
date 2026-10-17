import type { PlanDTO } from '@booking/types';

import { formatRand } from './logic';

export type CellTone = 'text' | 'yes' | 'no';
export interface CompareCell {
  text: string;
  tone: CellTone;
}
export interface CompareRow {
  /** i18n key under `plans.compare.rows`. */
  key: string;
  /** One cell per plan, in the order given. */
  cells: CompareCell[];
}

const YES: CompareCell = { text: 'Yes', tone: 'yes' };
const NO: CompareCell = { text: '–', tone: 'no' };
const text = (value: string): CompareCell => ({ text: value, tone: 'text' });

/**
 * The "Compare plans" table, built from the plan list so prices and
 * allowances never drift from the catalogue.
 * Yes/No cells carry English words that the screen replaces with translated ones.
 */
export function comparisonRows(plans: readonly PlanDTO[]): CompareRow[] {
  const each = (fn: (p: PlanDTO) => CompareCell): CompareCell[] =>
    plans.map(fn);
  return [
    { key: 'price', cells: each((p) => text(formatRand(p.price_cents))) },
    {
      key: 'jobs',
      cells: each((p) =>
        p.included_jobs === null ? NO : text(String(p.included_jobs)),
      ),
    },
    {
      key: 'extra',
      cells: each((p) =>
        p.extra_job_cents === null ? NO : text(formatRand(p.extra_job_cents)),
      ),
    },
    { key: 'companion', cells: each((p) => (p.has_companion ? YES : NO)) },
    { key: 'reports', cells: each((p) => (p.has_companion ? YES : NO)) },
  ];
}

/** Paid plans only: the three tier cards. */
export function paidPlans(plans: readonly PlanDTO[]): PlanDTO[] {
  return plans.filter((p) => p.has_companion);
}

/** The lowest paid price, for "Add your AI companion from R200". */
export function lowestPaidPriceCents(plans: readonly PlanDTO[]): number | null {
  const prices = paidPlans(plans).map((p) => p.price_cents);
  return prices.length ? Math.min(...prices) : null;
}
