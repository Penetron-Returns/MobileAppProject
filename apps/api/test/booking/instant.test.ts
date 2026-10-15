import { describe, expect, it } from 'vitest';

import { isInstant, normaliseInstant } from '@booking/features/lib/time.ts';

describe('isInstant / normaliseInstant', () => {
  const MS = Date.UTC(2026, 9, 16);
  it.each([
    ['2026-10-16T00:00:00.0000000+00:00', MS],
    ['2026-10-16T00:00:00.0000000Z', MS],
    ['2026-10-16T00:00:00.1234567Z', MS + 123],
    ['2026-10-16T02:00:00.123456789+02:00', MS + 123],
    ['2026-10-16T00:00:00.5Z', MS + 500],
    ['2026-10-16T00:00:00.12Z', MS + 120],
    ['2026-10-16T00:00:00Z', MS],
    ['2026-10-16T00:00Z', MS],
    ['2026-10-16T00:00:00.000+00:00', MS],
  ])('accepts %s and parses to the right epoch ms', (v, ms) => {
    expect(isInstant(v)).toBe(true);
    expect(Date.parse(normaliseInstant(v))).toBe(ms);
  });

  it.each([
    '2026-10-16T00:00:00',
    '2026-10-16T00:00:00.1234567',
    '2026-10-16',
    '2026-10-16T00:00:00.Z',
    '2026-10-16T00:00:00.1234567890Z',
    '2026-10-16T00:00:00+0000',
    'tomorrow',
    '',
    '2026-13-45T00:00:00.0000000Z',
  ])('rejects %s', (v) => {
    expect(isInstant(v)).toBe(false);
  });
});
