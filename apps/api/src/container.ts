import { createAttendanceServiceFromRepository, createSupabaseAttendanceRepository } from '@booking/features/attendance/index.ts';
import { createBookingService } from '@booking/features/bookings/index.ts';
import { getEnv, type Env } from './env.ts';
import { createClerkAdmin } from '@booking/features/team/lib/clerkAdmin.ts';
import type { Db } from '@booking/features/lib/db.ts';
import { getDb } from './lib/db.ts';
import { runInBackground } from './lib/background.ts';
import { createLogger } from '@booking/features/lib/logger.ts';
import { createAccountEvents, eventSenderFromEnv } from '@booking/companion/events/events.ts';
import { appointmentEventsFromEnv } from '@booking/companion/events/appointmentEvents.ts';
import { createCompanionService, type CompanionService } from '@booking/companion/nerova/companionService.ts';
import { createNerovaClientFromEnv } from '@booking/companion/nerova/httpClient.ts';
import { createPlanRepository } from '@booking/features/plans/services/planRepository.ts';
import { createUsageService } from '@booking/features/plans/services/usage.ts';
import { createNotificationService } from '@booking/app-store/whatsapp/notifications/index.ts';
import { createPushSender } from '@booking/app-store/whatsapp/notifications/push.ts';
import { createEntitlementService } from '@booking/features/plans/services/entitlements.ts';
import { createDeviceTokenService } from '@booking/features/voice/deviceTokens.ts';
import { createSupabaseDeviceTokenRepository } from '@booking/features/voice/repository.ts';
import type { DeviceTokenService } from '@booking/features/voice/ports.ts';
import type { AccountEventsPort, AttendanceService, BookingService, ClerkAdmin, EntitlementService, NotificationService, UsageService } from '@booking/features/ports.ts';

/**
 * Composition root. Built once per warm function instance.
 * Tests build their own container with fakes via createContainer().
 */
export interface Container {
  env: Env;
  db: Db;
  booking: BookingService;
  /** Attendance check: pending questions, answers and the cron job */
  attendance: AttendanceService;
  notifications: NotificationService;
  entitlements: EntitlementService;
  nerovaEvents: AccountEventsPort;
  /** Plan usage, catalogue and report statistics */
  usage: UsageService;
  /** Nerova AI companion: owner chat sessions and outcome counts */
  companion: CompanionService;
  /** Clerk Backend API (organisation members and invitations) */
  clerkAdmin: ClerkAdmin;
  /** Scoped long-lived credential for the voice upload and attendance answer while the app is backgrounded */
  voiceTokens: DeviceTokenService;
  /** Injected clock for connector-level "now" (tests pin it) */
  clock: () => Date;
}

export function createContainer(env: Env, db: Db = getDb(env)): Container {
  const notifications = createNotificationService({ env, db });
  const bookingLogger = createLogger({ module: 'booking' });
  const entitlements = createEntitlementService({ db });
  const booking = createBookingService({
    db,
    notifications,
    appointmentEvents: appointmentEventsFromEnv(env, entitlements),
    defer: (task) => runInBackground(task, bookingLogger, 'appointment_notification_deferred_failed'),
  });
  const attendanceRepo = createSupabaseAttendanceRepository(db);
  const attendance = createAttendanceServiceFromRepository({
    repo: attendanceRepo,
    booking,
    clock: () => new Date(),
    push: createPushSender({
      listUserTokens: async (businessId, userIds) => (await attendanceRepo.listDeviceTokens(businessId, userIds)).map((d) => d.token),
      accessToken: env.EXPO_ACCESS_TOKEN,
      logger: createLogger({ module: 'attendance_push' }),
    }),
  });
  const nerovaEvents = createAccountEvents({ sender: eventSenderFromEnv(env), entitlements });
  const clock = () => new Date();
  const planRepo = createPlanRepository({ db });
  const usage = createUsageService({ repo: planRepo, clock });
  const companion = createCompanionService({ nerova: createNerovaClientFromEnv(env), plans: planRepo, embedOrigin: env.NEROVA_EMBED_ORIGIN,
    nativeSessions: env.NEROVA_NATIVE_SESSIONS === 'true',
    nativeAppId: env.NEROVA_APP_ID,
    forwardReturnUrl: env.NEROVA_WHATSAPP_RETURN_URL === 'true',
    clock,
  });
  const clerkAdmin = createClerkAdmin({ secretKey: env.CLERK_SECRET_KEY });
  const voiceTokens = createDeviceTokenService({ repo: createSupabaseDeviceTokenRepository(db), clock });
  return { env, db, booking, attendance, notifications, entitlements, nerovaEvents, usage, companion, clerkAdmin, voiceTokens, clock };
}

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= createContainer(getEnv());
  return cached;
}
