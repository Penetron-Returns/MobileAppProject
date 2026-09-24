/**
 * Structured JSON logger. Customer PII is redacted before anything is
 * written: phone numbers are masked to the last 4 digits and known PII keys
 * (names, message bodies, emails, tokens) are replaced entirely.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT_KEYS = new Set([
  'name',
  'profile_name',
  'display_name',
  'email',
  'body',
  'text',
  'caption',
  'notes',
  'note',
  'access_token',
  'token',
  'authorization',
  'password',
  'encrypted_aes_key',
  'encrypted_flow_data',
]);

const PHONE_RE = /\+?\d[\d\s-]{7,}\d/g;

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= 4 ? '****' : `***${digits.slice(-4)}`;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return value.replace(PHONE_RE, (m) => maskPhone(m));
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    if (value instanceof Error) {
      return { name: value.name, message: redact(value.message, depth + 1) };
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(base: Record<string, unknown> = {}): Logger {
  const write = (level: Level, msg: string, fields?: Record<string, unknown>) => {
    const line = JSON.stringify({
      level,
      msg,
      time: new Date().toISOString(),
      ...(redact({ ...base, ...fields }) as Record<string, unknown>),
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  };
  return {
    debug: (m, f) => {
      if (process.env.LOG_LEVEL === 'debug') write('debug', m, f);
    },
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (fields) => createLogger({ ...base, ...fields }),
  };
}
