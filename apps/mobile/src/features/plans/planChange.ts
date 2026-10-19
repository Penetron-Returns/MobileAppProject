import type { PlanChangePreviewDTO, PlanKey } from '@booking/types';

import { businessDate, formatDayMonth } from '@/lib/time';

import { formatPrice } from '@/lib/format';

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
    due: formatPrice(preview.amount_due_now_cents, preview.currency),
    next: formatPrice(preview.next_amount_cents, preview.currency),
    date: formatEffectiveDate(
      (preview.direction === 'upgrade'
        ? preview.next_billing_at
        : preview.effective_at) ?? preview.effective_at,
      timezone,
    ),
  };
}
