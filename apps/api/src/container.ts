import { createAttendanceServiceFromRepository, createSupabaseAttendanceRepository } from '@booking/features/attendance/index.ts';
import { createBookingService } from '@booking/features/bookings/index.ts';
import { getEnv, type Env } from './env.ts';
import { createClerkAdmin } from '@booking/features/team/lib/clerkAdmin.ts';
import type { Db } from '@booking/features/lib/db.ts';
import { getDb } from './lib/db.ts';
import { createLogger } from '@booking/features/lib/logger.ts';
import { createNotificationService } from '@booking/app-store/whatsapp/notifications/index.ts';
import { createPushSender } from '@booking/app-store/whatsapp/notifications/push.ts';
import { createReportRepository } from '@booking/features/reports/services/reportRepository.ts';
import { createReportService } from '@booking/features/reports/services/reports.ts';
import type { AttendanceService, BookingService, ClerkAdmin, NotificationService, ReportService } from '@booking/features/ports.ts';

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
  /** Monthly booking figures for the reports screen */
  reports: ReportService;
  /** Clerk Backend API (organisation members and invitations) */
  clerkAdmin: ClerkAdmin;
  /** Injected clock (tests pin it) */
  clock: () => Date;
}

export function createContainer(env: Env, db: Db = getDb(env)): Container {
  const notifications = createNotificationService({ env, db });
  const clock = () => new Date();
  const clerkAdmin = createClerkAdmin({ secretKey: env.CLERK_SECRET_KEY });
  const booking = createBookingService({ db, notifications });
  const attendanceRepo = createSupabaseAttendanceRepository(db);
  const attendance = createAttendanceServiceFromRepository({
    repo: attendanceRepo,
    booking,
    clock,
    push: createPushSender({
      listUserTokens: async (businessId, userIds) => (await attendanceRepo.listDeviceTokens(businessId, userIds)).map((d) => d.token),
      accessToken: env.EXPO_ACCESS_TOKEN,
      logger: createLogger({ module: 'attendance_push' }),
    }),
  });
  const reports = createReportService({ repo: createReportRepository({ db }), clock });
  return { env, db, booking, attendance, notifications, reports, clerkAdmin, clock };
}

let cached: Container | undefined;

export function getContainer(): Container {
  cached ??= createContainer(getEnv());
  return cached;
}
