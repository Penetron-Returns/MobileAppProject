// STUB — WS-C replaces with WhatsApp confirmations/templates + Expo push.
import type { Env } from '../env';
import type { Db } from '../lib/db';
import type { NotificationService } from '../ports';

export interface NotificationDeps {
  env: Env;
  db: Db;
}

export function createNotificationService(_deps: NotificationDeps): NotificationService {
  return {
    async appointmentChanged() {
      // no-op until WS-C lands
    },
  };
}
