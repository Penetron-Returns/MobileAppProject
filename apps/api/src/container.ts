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
import { createNerovaClientChannelFromEnv } from '@booking/companion/nerova/clientChannel.ts';
import type { NerovaClientChannel } from '@booking/app-store/whatsapp/notifications/nerovaChannel.ts';
import { createNerovaClientFromEnv } from '@booking/companion/nerova/httpClient.ts';
import { createHttpCompanionChatClient } from '@booking/companion/nerova/httpChatClient.ts';
import { createCompanionSettingsService, type CompanionSettingsService } from '@booking/companion/nerova/settings.ts';
import { getBookingRepository } from '@booking/features/bookings/index.ts';
import { createVoiceAskService, type VoiceAskService } from '@booking/companion/nerova/voiceAsk.ts';
import { createPlanRepository } from '@booking/features/plans/services/planRepository.ts';
import { billingConfigFromEnv } from '@booking/features/billing/lib/config.ts';
import { createBillingService } from '@booking/features/billing/services/billingService.ts';
import { createSupabaseBillingRepository } from '@booking/features/billing/services/billingRepository.ts';
import { createStripeHttpClient } from '@booking/features/billing/services/stripeHttpClient.ts';
import type { BillingService, BillingSummary } from '@booking/features/billing/ports.ts';
import { createUsageService } from '@booking/features/plans/services/usage.ts';
import { createNotificationService } from '@booking/app-store/whatsapp/notifications/index.ts';
import { createPushSender } from '@booking/app-store/whatsapp/notifications/push.ts';
import { createEntitlementService } from '@booking/features/plans/services/entitlements.ts';
import { createStoriesService } from '@booking/features/stories/index.ts';
import type { StoriesService } from '@booking/features/stories/ports.ts';
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
  /** Stripe Checkout/Portal, the Stripe webhook handler and the subscription summary shown with the plans */
  billing: BillingService & BillingSummary;
  /** Nerova AI companion: owner chat sessions and outcome counts */
  companion: CompanionService;
  /** Owner-only proxy to Nerova's companion settings (approval policy, undo window) */
  companionSettings: CompanionSettingsService;
  /** Spoken requests to the companion and their approvals (Hey Clovie, app closed) */
  voiceAsk: VoiceAskService;
  /** Clerk Backend API (organisation members and invitations) */
  clerkAdmin: ClerkAdmin;
  /** Scoped long-lived credential for the voice upload and attendance answer while the app is backgrounded */
  voiceTokens: DeviceTokenService;
  /** Clovie stories (Brief, Client updates, Business update, product updates) and their cron job */
  stories: StoriesService;
  /** Client messages for businesses whose WhatsApp number is on Nerova (reminders are Nerova's there) */
  nerovaChannel?: NerovaClientChannel;
  /** Injected clock for connector-level "now" (tests pin it) */
  clock: () => Date;
}

export function createContainer(env: Env, db: Db = getDb(env)): Container {
  const entitlements = createEntitlementService({ db });
  const planRepo = createPlanRepository({ db });
  const nerovaChannel = createNerovaClientChannelFromEnv(env, { entitlements, plans: planRepo });
  const notifications = createNotificationService({ env, db, overrides: { nerovaChannel } });
  const bookingLogger = createLogger({ module: 'booking' });
  const nerovaEvents = createAccountEvents({ sender: eventSenderFromEnv(env), entitlements });
  const clock = () => new Date();
  const clerkAdmin = createClerkAdmin({ secretKey: env.CLERK_SECRET_KEY });
  const billing = createBillingService({
    stripe: env.STRIPE_SECRET_KEY ? createStripeHttpClient({ secretKey: env.STRIPE_SECRET_KEY }) : null,
    config: billingConfigFromEnv(env),
    repo: createSupabaseBillingRepository(db),
    events: nerovaEvents,
    clerk: clerkAdmin,
    defer: (task) => runInBackground(task, createLogger({ module: 'billing' }), 'billing_deferred_task_failed'),
    clock,
  });
  const booking = createBookingService({
    db,
    notifications,
    appointmentEvents: appointmentEventsFromEnv(env, entitlements),
    meter: billing,
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
  const usage = createUsageService({ repo: planRepo, clock, billing });
  const companion = createCompanionService({ nerova: createNerovaClientFromEnv(env), plans: planRepo, embedOrigin: env.NEROVA_EMBED_ORIGIN,
    nativeSessions: env.NEROVA_NATIVE_SESSIONS === 'true',
    nativeAppId: env.NEROVA_APP_ID,
    forwardReturnUrl: env.NEROVA_WHATSAPP_RETURN_URL === 'true',
    clock,
  });
  const companionSettings = createCompanionSettingsService({
    nerova: createNerovaClientFromEnv(env),
    plans: planRepo,
    recordAudit: (entry) => getBookingRepository({ db }).recordAudit(entry),
  });
  const voiceTokens = createDeviceTokenService({
    repo: createSupabaseDeviceTokenRepository(db),
    clock,
    defer: (task) => runInBackground(task, createLogger({ module: 'voice_tokens' }), 'voice_token_touch_failed'),
  });
  const stories = createStoriesService({ db, entitlements, clock, voiceEnabled: env.VOICE_CLOUD_STT === 'true' });
  const voiceAsk = createVoiceAskService({ companion, chat: createHttpCompanionChatClient(), clock });
  return { env, db, booking, attendance, notifications, entitlements, nerovaEvents, usage, billing, companion, companionSettings, voiceAsk, clerkAdmin, voiceTokens, stories, nerovaChannel, clock };
}

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= createContainer(getEnv());
  return cached;
}
