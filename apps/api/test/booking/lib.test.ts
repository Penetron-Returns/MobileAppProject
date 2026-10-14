import { describe, expect, it } from 'vitest';

import { normalizePhone, tryNormalizePhone } from '@booking/features/lib/phone.ts';
import {
  addDays,
  dateInZone,
  dateRange,
  dayBoundsInZone,
  diffDays,
  formatTimeOfDay,
  isIsoDate,
  normaliseTimeOfDay,
  parsePgTimestamp,
  parseTimeOfDay,
  parseTsRange,
  rangeBounds,
  serializeTsRange,
  toIsoInstant,
  wallClockToEpoch,
  weekdayOf,
} from '@booking/features/lib/time.ts';

describe('parsePgTimestamp / toIsoInstant', () => {
  it.each([
    ['2026-09-30 09:00:00+00', '2026-09-30T09:00:00.000Z'],
    ['2026-09-30 11:00:00+02', '2026-09-30T09:00:00.000Z'],
    ['2026-09-30 11:00:00+02:00', '2026-09-30T09:00:00.000Z'],
    ['2026-09-30T14:30:00+05:30', '2026-09-30T09:00:00.000Z'],
    ['2026-09-30T04:00:00-05', '2026-09-30T09:00:00.000Z'],
    ['2026-09-30T09:00:00Z', '2026-09-30T09:00:00.000Z'],
    ['2026-09-30T09:00:00.123456+00', '2026-09-30T09:00:00.123Z'],
    ['2026-09-30 09:00+00', '2026-09-30T09:00:00.000Z'],
    ['1900-01-01 00:19:32+00:19:32', '1900-01-01T00:00:00.000Z'],
  ])('%s → %s', (input, expected) => {
    expect(toIsoInstant(input)).toBe(expected);
  });

  it('rejects garbage', () => {
    expect(() => parsePgTimestamp('yesterday')).toThrow();
    expect(() => parsePgTimestamp('2026-09-30')).toThrow();
  });
});

describe('tstzrange', () => {
  it('parses the PostgREST quoted form', () => {
    expect(parseTsRange('["2026-09-30 09:00:00+00","2026-09-30 10:00:00+00")')).toEqual({
      lower: '2026-09-30T09:00:00.000Z',
      upper: '2026-09-30T10:00:00.000Z',
      lowerInclusive: true,
      upperInclusive: false,
    });
  });

  it('parses unquoted, ISO and inclusive/exclusive combinations', () => {
    const r = parseTsRange('(2026-09-30T11:00:00+02:00, 2026-09-30T12:00:00+02:00]');
    expect(r).toEqual({
      lower: '2026-09-30T09:00:00.000Z',
      upper: '2026-09-30T10:00:00.000Z',
      lowerInclusive: false,
      upperInclusive: true,
    });
  });

  it('handles empty and unbounded ranges', () => {
    expect(parseTsRange('empty')).toBeNull();
    expect(parseTsRange('[,"2026-09-30 10:00:00+00")')).toMatchObject({ lower: null, lowerInclusive: false });
    expect(parseTsRange('["2026-09-30 10:00:00+00",infinity)')).toMatchObject({ upper: null });
  });

  it('rejects malformed literals', () => {
    expect(() => parseTsRange('2026-09-30')).toThrow();
    expect(() => parseTsRange('[a,b,c)')).toThrow();
    expect(() => parseTsRange('["2026-09-30 10:00:00+00,)')).toThrow();
    expect(() => rangeBounds('[,"2026-09-30 10:00:00+00")')).toThrow();
  });

  it('round-trips through the serializer', () => {
    const literal = serializeTsRange('2026-09-30T11:00:00+02:00', '2026-09-30T10:00:00Z');
    expect(literal).toBe('[2026-09-30T09:00:00.000Z,2026-09-30T10:00:00.000Z)');
    expect(rangeBounds(literal)).toEqual({ start: '2026-09-30T09:00:00.000Z', end: '2026-09-30T10:00:00.000Z' });
  });
});

describe('wall clock', () => {
  it('parses and formats times of day', () => {
    expect(parseTimeOfDay('09:30')).toBe(570);
    expect(parseTimeOfDay('09:30:00')).toBe(570);
    expect(parseTimeOfDay('24:00')).toBe(1440);
    expect(() => parseTimeOfDay('24:30')).toThrow();
    expect(() => parseTimeOfDay('9:30')).toThrow();
    expect(formatTimeOfDay(570)).toBe('09:30');
    expect(normaliseTimeOfDay('17:00:00')).toBe('17:00');
  });

  it('does date arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(diffDays('2026-09-01', '2026-10-01')).toBe(30);
    expect(dateRange('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(dateRange('2026-10-01', '2026-09-29')).toEqual([]);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });

  it('uses 0 = Sunday', () => {
    expect(weekdayOf('2026-09-27')).toBe(0);
    expect(weekdayOf('2026-09-28')).toBe(1);
    expect(weekdayOf('2026-10-03')).toBe(6);
  });

  it('converts wall clock to instants per zone', () => {
    expect(new Date(wallClockToEpoch('2026-09-30', 540, 'Africa/Johannesburg')).toISOString()).toBe(
      '2026-09-30T07:00:00.000Z',
    );
    expect(dateInZone(new Date('2026-09-30T23:30:00Z'), 'Africa/Johannesburg')).toBe('2026-10-01');
  });

  it('handles DST days in Europe/London', () => {
    // 2026-03-29: clocks go 01:00 GMT → 02:00 BST (23h day)
    const spring = dayBoundsInZone('2026-03-29', 'Europe/London');
    expect((spring.end - spring.start) / 3_600_000).toBe(23);
    // wall time in the gap resolves forward
    expect(new Date(wallClockToEpoch('2026-03-29', 90, 'Europe/London')).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
    // 2026-10-25: clocks go 02:00 BST → 01:00 GMT (25h day)
    const autumn = dayBoundsInZone('2026-10-25', 'Europe/London');
    expect((autumn.end - autumn.start) / 3_600_000).toBe(25);
    // ambiguous wall time resolves to the first occurrence (BST)
    expect(new Date(wallClockToEpoch('2026-10-25', 90, 'Europe/London')).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });
});

describe('phone', () => {
  it.each([
    ['082 123 4567', '+27821234567'],
    ['0821234567', '+27821234567'],
    ['+27 82 123 4567', '+27821234567'],
    ['0027821234567', '+27821234567'],
    ['+44 7911 123456', '+447911123456'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('rejects invalid numbers without echoing them', () => {
    expect(tryNormalizePhone('12345')).toBeNull();
    expect(tryNormalizePhone('')).toBeNull();
    expect(tryNormalizePhone('not a phone')).toBeNull();
    try {
      normalizePhone('0821');
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('0821');
    }
  });
});
