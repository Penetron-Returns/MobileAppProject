import type { PlanChangePreviewDTO, PlanKey } from '@booking/types';

import { businessDate, formatDayMonth } from '@/lib/time';

import { formatRand } from './logic';

/** A downgrade the owner has booked for the end of the period. */
export interface ScheduledChange {
  plan: PlanKey;
  effective_at: string;
}

export const PAYMENT_FAILED = 'PAYMENT_FAILED';

/** `18 Nov`, in the business timezone. */
export function formatEffectiveDate(iso: string, timezone: string): string {
  return formatDayMonth(businessDate(iso, timezone));
}

export type PlanChangeAmounts = {
  due: string;
  next: string;
  date: string;
};

export function planChangeAmounts(
  preview: PlanChangePreviewDTO,
  timezone: string,
): PlanChangeAmounts {
  return {
    due: formatRand(preview.amount_due_now_cents),
    next: formatRand(preview.next_amount_cents),
    date: formatEffectiveDate(
      (preview.direction === 'upgrade'
        ? preview.next_billing_at
        : preview.effective_at) ?? preview.effective_at,
      timezone,
    ),
  };
}
