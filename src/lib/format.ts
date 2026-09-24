/**
 * Money is integer cents in the business currency (default ZAR).
 * We always render the symbol + en-US grouping (`R 1,250.00`) so amounts
 * look the same on every device regardless of Intl support.
 */
const SYMBOLS: Record<string, string> = {
  ZAR: 'R',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  KES: 'KSh',
  NGN: '₦',
  BWP: 'P',
  NAD: 'N$',
  INR: '₹',
};

/** Symbols that are letters get a space after them (`R 10.00`, `KSh 5.00`). */
function joinSymbol(symbol: string, amount: string) {
  return /[A-Za-z]$/.test(symbol)
    ? `${symbol} ${amount}`
    : `${symbol}${amount}`;
}

export function currencySymbol(currency = 'ZAR') {
  return SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase();
}

function groupThousands(intPart: string) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatNumber(value: number, decimals: number) {
  try {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    const fixed = Math.abs(value).toFixed(decimals);
    const [i, f] = fixed.split('.');
    return `${value < 0 ? '-' : ''}${groupThousands(i)}${f ? `.${f}` : ''}`;
  }
}

export function formatMoney(
  cents: number | null | undefined,
  currency = 'ZAR',
  opts: { decimals?: boolean } = {},
) {
  const value = (cents ?? 0) / 100;
  const decimals = opts.decimals === false ? 0 : 2;
  const num = formatNumber(Math.abs(value), decimals);
  const out = joinSymbol(currencySymbol(currency), num);
  return value < 0 ? `-${out}` : out;
}

/** `R1.2k`, `R 950`, used on compact stat tiles. */
export function formatMoneyCompact(
  cents: number | null | undefined,
  currency = 'ZAR',
) {
  const value = (cents ?? 0) / 100;
  const symbol = currencySymbol(currency);
  const abs = Math.abs(value);
  let body: string;
  if (abs >= 1_000_000) body = `${trimZero((abs / 1_000_000).toFixed(1))}m`;
  else if (abs >= 1_000) body = `${trimZero((abs / 1_000).toFixed(1))}k`;
  else body = formatNumber(abs, 0);
  const out = abs >= 1_000 ? `${symbol}${body}` : joinSymbol(symbol, body);
  return value < 0 ? `-${out}` : out;
}

function trimZero(s: string) {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/** Parses user input like "1 250,50" or "R85" into cents. Returns null if invalid. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned) return null;
  // Treat a trailing ",dd" as a decimal comma; strip other separators.
  const normalised =
    /,\d{1,2}$/.test(cleaned) && !cleaned.includes('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  const n = Number(normalised);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2);
}

/** `60m`, `2h 30m`, `1h`. */
export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name: string | null | undefined, fallback = '?') {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Masks all but the last 4 digits (never log full numbers). */
export function maskPhone(phone: string | null | undefined) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return `•••• ${digits.slice(-4)}`;
}

/** Light, readable grouping for E.164 numbers: +27 82 123 4567. */
export function formatPhone(e164: string | null | undefined) {
  if (!e164) return '';
  const m = /^\+27(\d{2})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+27 ${m[1]} ${m[2]} ${m[3]}`;
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (us) return `+1 (${us[1]}) ${us[2]}-${us[3]}`;
  return e164;
}
