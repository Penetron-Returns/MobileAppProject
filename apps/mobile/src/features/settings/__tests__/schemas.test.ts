import {
  toCreateServiceRequest,
  toServiceFields,
  toStaffFields,
} from '../schemas';

describe('service and staff request builders', () => {
  const service = {
    name: 'Cut',
    category: '',
    duration_minutes: 45,
    price: 'R 250,50',
    is_active: true,
  };

  it('converts the typed price to cents and blank category to null', () => {
    expect(toServiceFields(service)).toEqual({
      name: 'Cut',
      category: null,
      duration_minutes: 45,
      price_cents: 25050,
      is_active: true,
    });
  });

  it('adds create-only defaults for a new service', () => {
    expect(toCreateServiceRequest(service)).toMatchObject({
      description: null,
      deposit_cents: 0,
      sort_order: 0,
    });
  });

  it('never sends login, photo or contact fields when editing staff', () => {
    const fields = toStaffFields({
      name: 'Emma',
      title: '',
      is_active: true,
      accepts_bookings: false,
      service_ids: ['s1'],
    });
    expect(Object.keys(fields).sort()).toEqual([
      'accepts_bookings',
      'is_active',
      'name',
      'service_ids',
      'title',
    ]);
    expect(fields.title).toBeNull();
  });
});
