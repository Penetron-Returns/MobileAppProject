import {
  bookableStaff,
  toCreateRequest,
  upcomingDates,
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

describe('upcomingDates', () => {
  it('lists consecutive dates from today across a month end', () => {
    expect(upcomingDates('2026-10-30', 4)).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});
