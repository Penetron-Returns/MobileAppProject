import type { RowContextMenuAction } from '@booking/ui';
import { router } from 'expo-router';
import { CalendarPlus, ExternalLink, MessageCircle } from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { Linking } from 'react-native';

import { whatsAppChatUrl } from '@/features/dashboard/logic';
import { toast } from '@/lib/toast';

/** What the client menu needs from a list row. */
export interface MenuClient {
  id: string;
  name: string | null;
  phone_e164: string;
}

/**
 * Long-press actions of a client row: Open the profile, Book (New booking with
 * the client already chosen) and Message on WhatsApp.
 */
export function clientMenuActions(
  client: MenuClient,
  displayName: string,
  t: TFunction,
): RowContextMenuAction[] {
  return [
    {
      key: 'open',
      label: t('clientMenu.open'),
      icon: ExternalLink,
      onPress: () => router.push(`/clients/${client.id}` as never),
    },
    {
      key: 'book',
      label: t('clientMenu.book'),
      icon: CalendarPlus,
      onPress: () =>
        router.push({
          pathname: '/new-booking',
          params: { clientId: client.id },
        } as never),
    },
    {
      key: 'message',
      label: t('clientMenu.message'),
      icon: MessageCircle,
      onPress: () => {
        Linking.openURL(
          whatsAppChatUrl(
            client.phone_e164,
            t('clientMenu.greeting', { name: displayName }),
          ),
        ).catch(() =>
          toast.info(t('today.openingWhatsApp', { name: displayName })),
        );
      },
    },
  ];
}
