import type { AppointmentListItem } from '../hooks';
import { detailFromListItem } from '../placeholder';

const ROW = {
  id: 'apt-1',
  client_id: 'c1',
  service_id: 's1',
  staff_id: 'st1',
  starts_at: '2026-10-14T08:00:00Z',
  ends_at: '2026-10-14T09:00:00Z',
  duration_minutes: 60,
  status: 'confirmed',
  source: 'app',
  price_cents: 35000,
  notes: 'Window seat',
  checked_in_at: null,
  client_confirmed_at: null,
  client: { id: 'c1', name: 'Zanele', phone_e164: '+27821234567' },
  service: { name: 'Cut' },
  staff: { id: 'st1', name: 'Thandi' },
} as unknown as AppointmentListItem;

describe('detailFromListItem', () => {
  it('carries what the calendar row knows so the detail screen can paint at once', () => {
    const detail = detailFromListItem(ROW);
    expect(detail).toMatchObject({
      id: 'apt-1',
      price_cents: 35000,
      notes: 'Window seat',
      status: 'confirmed',
      client: { name: 'Zanele', phone_e164: '+27821234567' },
      service: { name: 'Cut' },
      staff: { name: 'Thandi' },
    });
  });
  it('fills what the list does not carry with neutral values', () => {
    const detail = detailFromListItem(ROW);
    expect(detail.client.tags).toEqual([]);
    expect(detail.staff.photo_url).toBeNull();
  });
});
