import {
  bookableStaff,
  bookingHorizonDays,
  toCreateRequest,
  cancelReasonText,
  cancellationWindowMinutes,
  canChange,
  closestSlots,
  dayRange,
  dayRelation,
  isLateCancellation,
  pickDay,
  primaryAction,
  slotStaffId,
  statusCapsule,
  toCancelRequest,
  toRescheduleRequest,
  windowHours,
  type BookingForm,
} from '../logic';

const BASE: BookingForm = {
  clientMode: 'existing',
  clientId: 'client-1',
  newClientName: '',
  newClientPhone: '',
  serviceId: 'service-1',
  staffId: null,
  startsAt: '2026-10-13T07:00:00.000Z',
  notes: '  ',
  sendWhatsApp: true,
};

describe('toCreateRequest', () => {
  it('books an existing client with no staff preference', () => {
    expect(toCreateRequest(BASE)).toEqual({
      ok: true,
      request: {
        client_id: 'client-1',
        service_id: 'service-1',
        staff_id: null,
        starts_at: '2026-10-13T07:00:00.000Z',
        notes: null,
        send_whatsapp_confirmation: true,
      },
    });
  });

  it('sends a trimmed new client instead of a client id', () => {
    const result = toCreateRequest({
      ...BASE,
      clientMode: 'new',
      clientId: 'ignored',
      newClientName: ' Ayanda ',
      newClientPhone: ' 082 555 0101 ',
    });
    expect(result.ok && result.request).toMatchObject({
      new_client: { name: 'Ayanda', phone: '082 555 0101' },
    });
    expect(result.ok && 'client_id' in result.request).toBe(false);
  });

  it.each([
    ['no existing client', { clientId: null }, 'client'],
    [
      'a new client without a phone',
      { clientMode: 'new' as const, newClientName: 'A', newClientPhone: ' ' },
      'newClient',
    ],
    ['no service', { serviceId: null }, 'service'],
    ['no slot', { startsAt: null }, 'slot'],
  ])('rejects a form with %s', (_label, patch, error) => {
    expect(toCreateRequest({ ...BASE, ...patch })).toEqual({
      ok: false,
      error,
    });
  });
});

describe('bookableStaff', () => {
  const staff = [
    { id: 'a', is_active: true, accepts_bookings: true },
    { id: 'b', is_active: false, accepts_bookings: true },
    { id: 'c', is_active: true, accepts_bookings: false },
    { id: 'd', is_active: true, accepts_bookings: true },
  ];
  const links = [
    { staff_id: 'a', service_id: 's1' },
    { staff_id: 'b', service_id: 's1' },
    { staff_id: 'c', service_id: 's1' },
    { staff_id: 'd', service_id: 's2' },
  ];

  it('keeps only active, bookable staff qualified for the service', () => {
    expect(bookableStaff(staff, links, 's1').map((s) => s.id)).toEqual(['a']);
  });

  it('returns nobody until a service is chosen', () => {
    expect(bookableStaff(staff, links, null)).toEqual([]);
  });
});

describe('pickDay', () => {
  const days = ['2026-10-15', '2026-10-17', '2026-10-20'];
  it.each([
    ['the wanted day when bookable', '2026-10-17', '2026-10-17'],
    [
      'the next bookable day when the wanted one is closed',
      '2026-10-16',
      '2026-10-17',
    ],
    [
      'the first day when nothing is on or after it',
      '2026-10-30',
      '2026-10-15',
    ],
    ['the first day with no preference', null, '2026-10-15'],
  ])('picks %s', (_label, wanted, expected) => {
    expect(pickDay(days, wanted)).toBe(expected);
  });

  it('returns null when no day is bookable', () => {
    expect(pickDay([], '2026-10-15')).toBeNull();
  });
});

describe('closestSlots', () => {
  const slot = (iso: string) => ({
    starts_at: iso,
    ends_at: iso,
    staff_ids: ['s1'],
  });
  const slots = [
    '2026-10-15T07:00:00Z',
    '2026-10-15T08:15:00Z',
    '2026-10-15T08:30:00Z',
    '2026-10-15T11:00:00Z',
    '2026-10-16T08:00:00Z',
  ].map(slot);

  it('offers the three nearest slots in time order', () => {
    expect(
      closestSlots(slots, '2026-10-15T08:00:00Z').map((s) => s.starts_at),
    ).toEqual(
      [
        '2026-10-15T08:15:00Z',
        '2026-10-15T08:30:00Z',
        '2026-10-15T07:00:00Z',
      ].sort(),
    );
  });

  it('breaks a tie towards the earlier slot', () => {
    const near = [slot('2026-10-15T07:30:00Z'), slot('2026-10-15T08:30:00Z')];
    expect(closestSlots(near, '2026-10-15T08:00:00Z', 1)[0].starts_at).toBe(
      '2026-10-15T07:30:00Z',
    );
  });

  it('returns fewer when fewer exist', () => {
    expect(closestSlots([], '2026-10-15T08:00:00Z')).toEqual([]);
  });
});

describe('slotStaffId / dayRange', () => {
  it('keeps the chosen staff member, else the first the engine lists', () => {
    const s = { starts_at: 'x', ends_at: 'y', staff_ids: ['a', 'b'] };
    expect(slotStaffId(s, 'b')).toBe('b');
    expect(slotStaffId(s, null)).toBe('a');
    expect(slotStaffId({ ...s, staff_ids: [] }, null)).toBeNull();
  });

  it('covers today through the horizon, inclusive', () => {
    expect(dayRange('2026-10-30', 3)).toEqual({
      from: '2026-10-30',
      to: '2026-11-02',
    });
  });
});

describe('toRescheduleRequest', () => {
  it('needs a chosen time', () => {
    expect(
      toRescheduleRequest({
        startsAt: null,
        staffId: null,
        notifyCustomer: true,
      }),
    ).toBeNull();
  });
  it('carries the staff choice and the notify flag', () => {
    expect(
      toRescheduleRequest({
        startsAt: '2026-10-15T08:00:00Z',
        staffId: 's1',
        notifyCustomer: false,
      }),
    ).toEqual({
      starts_at: '2026-10-15T08:00:00Z',
      staff_id: 's1',
      notify_customer: false,
    });
  });
});

describe('cancel helpers', () => {
  const labels = { client: 'Client asked', staff: 'Staff unavailable' };
  it.each([
    ['client', '', 'Client asked'],
    ['staff', 'ignored', 'Staff unavailable'],
    ['other', '  Burst pipe  ', 'Burst pipe'],
    ['other', '   ', null],
  ] as const)('reason %s / %j gives %j', (reason, other, expected) => {
    expect(cancelReasonText(reason, labels, other)).toBe(expected);
  });

  it('shapes the request', () => {
    expect(toCancelRequest('Client asked', false)).toEqual({
      reason: 'Client asked',
      notify_customer: false,
    });
  });

  it.each([
    [{ cancellation_window_minutes: 120 }, 120],
    [{ cancellation_window_minutes: 0 }, 0],
    [{ cancellation_window_minutes: -5 }, 1440],
    [{ cancellation_window_minutes: '60' }, 1440],
    [{}, 1440],
    [null, 1440],
    [[1], 1440],
  ])('reads the window from %j as %i', (rules, expected) => {
    expect(cancellationWindowMinutes(rules)).toBe(expected);
  });

  it.each([
    ['2026-10-14T20:00:00Z', 1440, true],
    ['2026-10-16T20:00:00Z', 1440, false],
    ['2026-10-15T08:00:00Z', 1440, false],
    ['2026-10-14T07:00:00Z', 60, true],
  ])('start %s with a %i min window is late: %s', (start, window, expected) => {
    expect(
      isLateCancellation(start, new Date('2026-10-14T08:00:00Z'), window),
    ).toBe(expected);
  });

  it('rounds the window up to whole hours', () => {
    expect(windowHours(1440)).toBe(24);
    expect(windowHours(90)).toBe(2);
    expect(windowHours(0)).toBe(1);
  });
});

describe('booking detail helpers', () => {
  it.each([
    ['confirmed', null, 'checkIn'],
    ['confirmed', '2026-10-14T08:00:00Z', 'checkOut'],
    ['completed', '2026-10-14T08:00:00Z', 'none'],
    ['cancelled', null, 'none'],
    ['no_show', null, 'none'],
  ] as const)('%s checked in %s gives %s', (status, at, expected) => {
    expect(primaryAction({ status, checked_in_at: at })).toBe(expected);
  });

  it('allows changes only while confirmed', () => {
    expect(canChange('confirmed')).toBe(true);
    expect(canChange('completed')).toBe(false);
  });

  it('shows a capsule only for exceptions', () => {
    expect(statusCapsule('confirmed')).toBeNull();
    expect(statusCapsule('completed')).toBeNull();
    expect(statusCapsule('no_show')).toBe('no_show');
    expect(statusCapsule('cancelled')).toBe('cancelled');
  });

  it('names today and tomorrow, including across a month end', () => {
    expect(dayRelation('2026-10-31', '2026-10-31')).toBe('today');
    expect(dayRelation('2026-11-01', '2026-10-31')).toBe('tomorrow');
    expect(dayRelation('2026-11-02', '2026-10-31')).toBe('other');
  });
});

describe('bookingHorizonDays', () => {
  it.each([
    [{ booking_horizon_days: 30 }, 30],
    [{ booking_horizon_days: 0 }, 60],
    [{ booking_horizon_days: 1.5 }, 60],
    [null, 60],
  ])('reads %j as %i', (rules, expected) => {
    expect(bookingHorizonDays(rules)).toBe(expected);
  });
});
