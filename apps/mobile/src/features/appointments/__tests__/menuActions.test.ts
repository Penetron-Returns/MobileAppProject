import { router } from 'expo-router';
import { Linking } from 'react-native';

import { clientMenuActions } from '@/features/clients/menuActions';

import { bookingMenuActions, type MenuBooking } from '../menuActions';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  return new Proxy({}, { get: () => View });
});

const t = ((key: string) => key) as never;
const booking = (over: Partial<MenuBooking> = {}): MenuBooking => ({
  id: 'b1',
  status: 'confirmed',
  client: { name: 'Anna', phone_e164: '+27821234567' },
  ...over,
});
const keys = (list: { key: string }[]) => list.map((a) => a.key);

beforeEach(() => jest.clearAllMocks());

describe('bookingMenuActions', () => {
  it('offers Open, Reschedule, Message and Cancel for a confirmed booking', () => {
    expect(keys(bookingMenuActions(booking(), t))).toEqual([
      'open',
      'reschedule',
      'message',
      'cancel',
    ]);
  });

  it('only offers Open and Message once the booking can no longer change', () => {
    expect(
      keys(bookingMenuActions(booking({ status: 'completed' }), t)),
    ).toEqual(['open', 'message']);
  });

  it('leaves out Message without a client', () => {
    expect(keys(bookingMenuActions(booking({ client: null }), t))).toEqual([
      'open',
      'reschedule',
      'cancel',
    ]);
  });

  it('Cancel only opens the cancel flow and marks itself destructive', () => {
    const cancel = bookingMenuActions(booking(), t).find(
      (a) => a.key === 'cancel',
    )!;
    expect(cancel.destructive).toBe(true);
    cancel.onPress();
    expect(router.push).toHaveBeenCalledWith('/bookings/cancel/b1');
  });

  it('Message opens a WhatsApp chat with the client', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    bookingMenuActions(booking(), t)
      .find((a) => a.key === 'message')!
      .onPress();
    expect(open.mock.calls[0][0]).toContain('https://wa.me/27821234567');
  });
});

describe('clientMenuActions', () => {
  const client = { id: 'c1', name: 'Anna', phone_e164: '+27821234567' };

  it('offers Open, Book and Message', () => {
    expect(keys(clientMenuActions(client, 'Anna', t))).toEqual([
      'open',
      'book',
      'message',
    ]);
  });

  it('Book opens New booking with the client preselected', () => {
    clientMenuActions(client, 'Anna', t)
      .find((a) => a.key === 'book')!
      .onPress();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/new-booking',
      params: { clientId: 'c1' },
    });
  });
});
