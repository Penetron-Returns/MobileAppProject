export type ReportSourceKey = 'whatsapp' | 'clovie';
export const REPORT_SOURCES: readonly ReportSourceKey[] = [
  'whatsapp',
  'clovie',
];

/**
 * Maps `appointments.source` (`whatsapp | app | web | nerova`) to the two
 * report sources. Customers booking through WhatsApp are "WhatsApp"; the
 * owner or staff booking in the app (`app`) or through the companion
 * (`nerova`) are "Clovie". `web` is the retired comparator booking page: no
 * product surface creates it any more, so any legacy row counts as Clovie
 * rather than adding a third category.
 */
export function reportSource(source: string): ReportSourceKey {
  return source === 'whatsapp' ? 'whatsapp' : 'clovie';
}

export interface SourceRow {
  key: ReportSourceKey;
  count: number;
  /** Whole percent of all bookings. */
  percent: number;
}

/** Rows for "Where bookings come from", biggest first; empty when nothing was booked. */
export function sourceRows(
  counts: Record<ReportSourceKey, number>,
): SourceRow[] {
  const total = REPORT_SOURCES.reduce((sum, k) => sum + counts[k], 0);
  if (total === 0) return [];
  const rows = REPORT_SOURCES.map((key) => ({
    key,
    count: counts[key],
    percent: Math.round((counts[key] / total) * 100),
  })).sort((a, b) => b.count - a.count);
  // Rounding must not make the split add up to 99 or 101.
  const rest = rows.slice(1).reduce((sum, r) => sum + r.percent, 0);
  rows[0] = { ...rows[0], percent: 100 - rest };
  return rows;
}
