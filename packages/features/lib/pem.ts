/**
 * Normalises a PEM read from an env var: strips surrounding quotes and turns
 * literal `\n` escapes (how a PEM fits on one .env line) into real newlines.
 * Always ends with a newline, which OpenSSL's PEM decoder requires.
 */
export function normalizePem(raw: string): string {
  const unquoted = raw.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
  return `${unquoted.replace(/\\r\\n|\\n/g, '\n').trim()}\n`;
}
