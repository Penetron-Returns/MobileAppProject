/** The top of the chart axis: the smallest 1, 2 or 5 times a power of ten that fits `max`. */
export function niceMax(max: number): number {
  if (max <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map((f) => f * magnitude).find((v) => v >= max) ?? max;
}

/** Three gridlines: 0, half and the axis top. */
export function axisTicks(axisMax: number): [number, number, number] {
  return [0, axisMax / 2, axisMax];
}

/** Bar height in px for `value`; zero is no bar at all, anything else is at least 2px. */
export function barHeight(
  value: number,
  axisMax: number,
  plotHeight: number,
): number {
  if (value <= 0) return 0;
  return Math.max(2, Math.round((value / axisMax) * plotHeight));
}

/** Compact axis label from cents: `R0`, `R6k`, `R1.5k`, `R2m`. */
export function compactMoney(cents: number, symbol: string): string {
  const units = cents / 100;
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  if (units >= 1_000_000) return `${symbol}${trim(units / 1_000_000)}m`;
  if (units >= 1000) return `${symbol}${trim(units / 1000)}k`;
  return `${symbol}${trim(units)}`;
}
