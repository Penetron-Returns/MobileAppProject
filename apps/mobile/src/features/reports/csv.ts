import type { RevenueBar } from './aggregate';

/** `date,revenue` rows of the chart, revenue as a decimal amount (cents are never rounded). */
export function revenueCsv(
  bars: readonly RevenueBar[],
  currency: string,
): string {
  const rows = bars.map((b) => `${b.key},${(b.cents / 100).toFixed(2)}`);
  return [`date,revenue_${currency.toLowerCase()}`, ...rows].join('\n');
}
