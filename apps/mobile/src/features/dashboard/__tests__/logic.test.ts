import {
  buildSparkline,
  parseDashboardSummary,
  whatsAppChatUrl,
} from '../logic';

const validSummary = {
  month_revenue_cents: 1245000,
  revenue_by_day: [
    { date: '2026-10-01', cents: 0 },
    { date: '2026-10-02', cents: 85000 },
  ],
  today: {
    total: 5,
    confirmed: 3,
    completed: 1,
    cancelled: 1,
    no_show: 0,
    checked_in: 1,
  },
  next_appointment_id: 'appt-1',
};

describe('parseDashboardSummary', () => {
  it('returns the summary unchanged when the RPC result is well formed', () => {
    expect(parseDashboardSummary(validSummary)).toEqual(validSummary);
  });

  it('maps a missing next appointment to null', () => {
    const parsed = parseDashboardSummary({
      ...validSummary,
      next_appointment_id: null,
    });
    expect(parsed.next_appointment_id).toBeNull();
  });

  it('treats a missing revenue_by_day as an empty month', () => {
    const withoutDays: Record<string, unknown> = { ...validSummary };
    delete withoutDays.revenue_by_day;
    expect(parseDashboardSummary(withoutDays).revenue_by_day).toEqual([]);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing today block', { ...validSummary, today: undefined }],
    ['a string revenue', { ...validSummary, month_revenue_cents: '12' }],
    [
      'a non-numeric today count',
      { ...validSummary, today: { ...validSummary.today, total: null } },
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => parseDashboardSummary(input)).toThrow(/dashboard_summary/);
  });
});

describe('buildSparkline', () => {
  it('returns null when there are no days', () => {
    expect(buildSparkline([])).toBeNull();
  });

  it.each([
    [
      'all-zero month draws a flat line on the baseline',
      [0, 0, 0],
      'M0 30 L50 30 L100 30',
    ],
    ['the peak day reaches the headroom line', [0, 10], 'M0 30 L100 3'],
    ['values scale relative to the peak', [5, 10], 'M0 16.5 L100 3'],
    ['a single day sits in the middle', [7], 'M50 3'],
  ])('%s', (_label, values, line) => {
    expect(buildSparkline(values)?.line).toBe(line);
  });

  it('closes the area path down to the baseline at both ends', () => {
    expect(buildSparkline([0, 10])?.area).toBe('M0 30 L0 30 L100 3 L100 30 Z');
  });

  it('honours a custom viewBox size', () => {
    expect(buildSparkline([0, 4], { width: 10, height: 10 })?.line).toBe(
      'M0 10 L10 1',
    );
  });
});

describe('whatsAppChatUrl', () => {
  it('strips the plus from an E.164 number and encodes the message', () => {
    expect(whatsAppChatUrl('+27825550101', 'Hi Sarah & co')).toBe(
      'https://wa.me/27825550101?text=Hi%20Sarah%20%26%20co',
    );
  });
});
