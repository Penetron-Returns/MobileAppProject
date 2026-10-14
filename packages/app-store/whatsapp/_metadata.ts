import type { AppManifest } from '../types.ts';

/**
 * The WhatsApp Free demo: a structured booking menu inside the customer's WhatsApp thread.
 * Removed after launch (the paid plans use the companion instead), so nothing outside this
 * folder and its registry line may depend on it.
 */
export const whatsappApp = {
  id: 'whatsapp',
  name: 'WhatsApp booking menu',
  kind: 'messaging',
  requiredFeature: 'whatsapp_menu',
  description: 'Customers book, reschedule and cancel from menus and pickers inside WhatsApp.',
} as const satisfies AppManifest;
