/**
 * Money is integer cents in the business currency, always passed in (there is
 * no default currency). We render the symbol + en-US grouping (`R 1,250.00`)
 * so amounts look the same on every device regardless of Intl support.
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
function joinSymbol(symbol: string, amount: string, tight: boolean) {
  return !tight && /[A-Za-z]$/.test(symbol)
    ? `${symbol} ${amount}`
    : `${symbol}${amount}`;
}

/** The symbol for any ISO 4217 code: our table, then Intl's narrow symbol, then the code itself. */
export function currencySymbol(currency: string) {
  const code = currency.toUpperCase();
  const known = SYMBOLS[code];
  if (known) return known;
  try {
    const parts = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
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

export interface MoneyOptions {
  /** `false`: whole units only. `'auto'`: cents only when there are some (`$200`, `$4.50`). Default: always two */
  decimals?: boolean | 'auto';
  /** No space after a letter symbol (`R200` rather than `R 200`), as the plan boards write prices */
  tight?: boolean;
}

export function formatMoney(
  cents: number | null | undefined,
  currency: string,
  opts: MoneyOptions = {},
) {
  const rounded = Math.round(cents ?? 0);
  const value = rounded / 100;
  const hasCents = rounded % 100 !== 0;
  const decimals =
    opts.decimals === false || (opts.decimals === 'auto' && !hasCents) ? 0 : 2;
  const num = formatNumber(Math.abs(value), decimals);
  const out = joinSymbol(currencySymbol(currency), num, opts.tight === true);
  return value < 0 ? `-${out}` : out;
}

/** A plan price as the plan boards write it: `R200`, `$16`, `£4.50`. */
export function formatPrice(cents: number, currency: string) {
  return formatMoney(cents, currency, { decimals: 'auto', tight: true });
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
