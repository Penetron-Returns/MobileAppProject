import type { AttendanceCheckDTO } from '@booking/types';

import {
  attendanceIdempotencyKey,
  parseAttendancePush,
  questionValues,
  withoutCheck,
} from '../logic';

function check(id: string, createdAt: string): AttendanceCheckDTO {
  return {
    id,
    appointment_id: `appt-${id}`,
    status: 'pending',
    outcome: null,
    audience: 'staff',
    escalated: false,
    created_at: createdAt,
    answered_at: null,
    client_first_name: 'Thandi',
    service_name: 'cut',
    starts_at: '2026-10-14T12:00:00.000Z',
    ends_at: '2026-10-14T13:00:00.000Z',
  };
}

describe('attendanceIdempotencyKey', () => {
  it('is deterministic per question and answer', () => {
    expect(attendanceIdempotencyKey('c1', 'came')).toBe('attendance:c1:came');
    expect(attendanceIdempotencyKey('c1', 'no_show')).toBe(
      'attendance:c1:no_show',
    );
  });
});

describe('parseAttendancePush', () => {
  it.each([
    [
      { type: 'attendance_check', checkId: 'c1', appointmentId: 'a1' },
      { type: 'attendance_check', checkId: 'c1', appointmentId: 'a1' },
    ],
    [
      { type: 'attendance_batch', count: '3' },
      { type: 'attendance_batch', count: 3 },
    ],
    [
      { type: 'attendance_summary', count: '12' },
      { type: 'attendance_summary', count: 12 },
    ],
  ])('accepts %j', (input, expected) => {
    expect(parseAttendancePush(input)).toEqual(expected);
  });

  it.each([
    ['nothing', undefined],
    ['another push type', { type: 'new_booking', id: 'x' }],
    ['a single check without ids', { type: 'attendance_check' }],
    [
      'an empty check id',
      { type: 'attendance_check', checkId: '', appointmentId: 'a' },
    ],
    ['a non-numeric count', { type: 'attendance_batch', count: 'many' }],
    [
      'a numeric count (data values are strings)',
      { type: 'attendance_batch', count: 3 },
    ],
  ])('rejects %s', (_label, input) => {
    expect(parseAttendancePush(input)).toBeNull();
  });
});

describe('questionValues', () => {
  it('formats the time in the business timezone', () => {
    expect(
      questionValues(
        check('c1', '2026-10-14T14:00:00Z'),
        'Africa/Johannesburg',
      ),
    ).toEqual({
      name: 'Thandi',
      service: 'cut',
      time: '14:00',
    });
  });
});

describe('withoutCheck', () => {
  it('drops one question and recounts', () => {
    const data = {
      count: 2,
      checks: [
        check('c1', '2026-10-14T14:00:00Z'),
        check('c2', '2026-10-14T15:00:00Z'),
      ],
    };
    const next = withoutCheck(data, 'c1');
    expect(next.count).toBe(1);
    expect(next.checks.map((c) => c.id)).toEqual(['c2']);
  });
});
