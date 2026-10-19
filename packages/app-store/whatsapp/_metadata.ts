import type { AppManifest } from '../types.ts';

/**
 * The WhatsApp booking menu: a deterministic, structured booking flow inside the customer's WhatsApp thread.
 */
export const whatsappApp = {
  id: 'whatsapp',
  name: 'WhatsApp booking menu',
  kind: 'messaging',
  description: 'Customers book, reschedule and cancel from menus and pickers inside WhatsApp.',
} as const satisfies AppManifest;
