import type { AttendanceCheckDTO, AttendanceOutcome } from '@booking/types';

import { questionValues } from '@/features/attendance/logic';

/**
 * One thing waiting on the owner. This is the shape Nerova's `CompanionMoment`
 * takes as `queueItems` (`accessibilityLabel` is our optional addition), so
 * swapping the placeholder for the SDK's queue is a rename, not a rewrite.
 */
export interface QueueItem {
  id: string;
  title: string;
  detail?: string;
  actions: { id: string; label: string; accessibilityLabel?: string }[];
}

export interface QueueLabels {
  /** "Did {name} make it to their {time} {service}?" */
  question: (values: { name: string; service: string; time: string }) => string;
  came: string;
  noShow: string;
  /** Screen-reader labels that name the client. */
  cameFor: (name: string) => string;
  noShowFor: (name: string) => string;
}

const OUTCOME_FOR_ACTION: Record<string, AttendanceOutcome> = {
  came: 'came',
  no_show: 'no_show',
};

/** The outcome an action id stands for, or null for an id we did not issue. */
export function outcomeForAction(actionId: string): AttendanceOutcome | null {
  return OUTCOME_FOR_ACTION[actionId] ?? null;
}

/** Attendance questions as queue items, oldest first (they go stale by the hour). */
export function attendanceQueue(
  checks: readonly AttendanceCheckDTO[],
  timezone: string,
  labels: QueueLabels,
): QueueItem[] {
  return [...checks]
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    .map((check) => ({
      id: check.id,
      title: labels.question(questionValues(check, timezone)),
      actions: [
        {
          id: 'came',
          label: labels.came,
          accessibilityLabel: labels.cameFor(check.client_first_name),
        },
        {
          id: 'no_show',
          label: labels.noShow,
          accessibilityLabel: labels.noShowFor(check.client_first_name),
        },
      ],
    }));
}
