import type { DashboardSummary } from '@shared/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`dashboard_summary: "${key}" is not a number`);
  }
  return value;
}

/** Narrows the untyped `dashboard_summary` RPC result (Postgres jsonb). */
export function parseDashboardSummary(value: unknown): DashboardSummary {
  if (!isRecord(value) || !isRecord(value.today)) {
    throw new Error('dashboard_summary: unexpected shape');
  }
  const byDay = Array.isArray(value.revenue_by_day) ? value.revenue_by_day : [];
  const nextId = value.next_appointment_id;
  return {
    month_revenue_cents: num(value, 'month_revenue_cents'),
    revenue_by_day: byDay.filter(isRecord).map((row) => ({
      date: String(row.date),
      cents: num(row, 'cents'),
    })),
    today: {
      total: num(value.today, 'total'),
      confirmed: num(value.today, 'confirmed'),
      completed: num(value.today, 'completed'),
      cancelled: num(value.today, 'cancelled'),
      no_show: num(value.today, 'no_show'),
      checked_in: num(value.today, 'checked_in'),
    },
    next_appointment_id: typeof nextId === 'string' ? nextId : null,
  };
}

/**
 * SVG paths for a sparkline in a `width × height` viewBox: `line` is the
 * stroke, `area` closes it to the baseline for the fill. Null when empty.
 */
export function buildSparkline(
  values: number[],
  { width = 100, height = 30 }: { width?: number; height?: number } = {},
): { line: string; area: string } | null {
  if (values.length === 0) return null;
  const max = Math.max(...values, 0);
  const headroom = height * 0.1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = values.length > 1 ? i * stepX : width / 2;
    const y = max > 0 ? height - (v / max) * (height - headroom) : height;
    return `${round(x)} ${round(y)}`;
  });
  const line = `M${points.join(' L')}`;
  const firstX = values.length > 1 ? 0 : width / 2;
  const lastX = values.length > 1 ? width : width / 2;
  const area = `M${round(firstX)} ${height} L${points.join(' L')} L${round(lastX)} ${height} Z`;
  return { line, area };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** wa.me deep link for an E.164 number with a prefilled message. */
export function whatsAppChatUrl(phoneE164: string, text: string) {
  return `https://wa.me/${phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
