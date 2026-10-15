import type { AppointmentStatus } from '@booking/types';
import type { RowContextMenuAction } from '@booking/ui';
import { router } from 'expo-router';
import {
  CalendarClock,
  ExternalLink,
  MessageCircle,
  X,
} from 'lucide-react-native';
import { Linking } from 'react-native';
import type { TFunction } from 'i18next';

import { canChange } from '@/features/bookings/logic';
import { whatsAppChatUrl } from '@/features/dashboard/logic';
import { toast } from '@/lib/toast';

/** What the booking menu needs: any list row with an id, status and client. */
export interface MenuBooking {
  id: string;
  status: AppointmentStatus;
  client: { name: string | null; phone_e164: string } | null;
}

export const cancelHref = (id: string) => `/bookings/cancel/${id}` as never;

/**
 * Long-press actions of a booking row or calendar block: Open, then Reschedule
 * and Cancel while the booking can still change, and Message when we have the
 * client's number. Cancel only opens the cancel flow (reason, late-cancel
 * warning, confirmation); the menu never cancels by itself.
 */
export function bookingMenuActions(
  booking: MenuBooking,
  t: TFunction,
): RowContextMenuAction[] {
  const name = booking.client?.name ?? t('bookingMenu.client');
  const actions: RowContextMenuAction[] = [
    {
      key: 'open',
      label: t('bookingMenu.open'),
      icon: ExternalLink,
      onPress: () => router.push(`/bookings/${booking.id}` as never),
    },
  ];
  if (canChange(booking.status)) {
    actions.push({
      key: 'reschedule',
      label: t('bookingMenu.reschedule'),
      icon: CalendarClock,
      onPress: () => router.push(`/bookings/reschedule/${booking.id}` as never),
    });
  }
  if (booking.client) {
    const phone = booking.client.phone_e164;
    actions.push({
      key: 'message',
      label: t('bookingMenu.message'),
      icon: MessageCircle,
      onPress: () => {
        Linking.openURL(
          whatsAppChatUrl(phone, t('bookingMenu.greeting', { name })),
        ).catch(() => toast.info(t('today.openingWhatsApp', { name })));
      },
    });
  }
  if (canChange(booking.status)) {
    actions.push({
      key: 'cancel',
      label: t('bookingMenu.cancel'),
      icon: X,
      destructive: true,
      onPress: () => router.push(cancelHref(booking.id)),
    });
  }
  return actions;
}
