// STUB — WS-C replaces with WhatsApp confirmations/templates + Expo push.
import type { Env } from '../env.ts';
import type { Db } from '../lib/db.ts';
import type { NotificationService } from '../ports.ts';

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
