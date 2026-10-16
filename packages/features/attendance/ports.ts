/** Attendance check contracts: repository, push delivery and the service the API uses. */
import type {
  AppointmentStatus,
  AttendanceCheckDTO,
  AttendanceMode,
  AttendanceOutcome,
  AttendancePendingResponse,
  ISODateTime,
  MemberRole,
  UUID,
} from '@booking/types';

/** A question joined with the appointment details the list and the pushes need. */
export interface AttendanceCheckRow {
  id: UUID;
  business_id: UUID;
  appointment_id: UUID;
  audience: 'staff' | 'owner';
  recipient_user_id: string | null;
  status: 'pending' | 'answered';
  outcome: AttendanceOutcome | 'resolved_elsewhere' | null;
  created_at: ISODateTime;
  notified_at: ISODateTime | null;
  escalated_at: ISODateTime | null;
  answered_at: ISODateTime | null;
  answered_by: string | null;
  appointment_status: AppointmentStatus;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  client_name: string | null;
  service_name: string;
}

export interface AttendanceDueRow {
  business_id: UUID;
  appointment_id: UUID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  checked_in_at: ISODateTime | null;
  staff_user_id: string | null;
  client_name: string | null;
  service_name: string;
}

export interface AttendanceBusinessContext {
  timezone: string;
  mode: AttendanceMode;
  hours: { weekday: number; opens_at: string; closes_at: string }[];
  ownerIds: string[];
}

export interface AttendancePushRow {
  userId: string;
  kind: 'check' | 'batch' | 'summary';
  checkIds: UUID[];
  localDate: string;
  sentAt: ISODateTime;
}

export interface NewAttendanceCheck {
  id: UUID;
  createdAt: ISODateTime;
  businessId: UUID;
  appointmentId: UUID;
  audience: 'staff' | 'owner';
  recipientUserId: string | null;
}

/**
 * Persistence for attendance checks. Every method but the two cron scans is scoped by
 * business_id. Conditional writes (`answerCheck`, `markEscalated`, `insertCheck`) return
 * whether they changed a row, so concurrent runs and replays are harmless.
 */
export interface AttendanceRepository {
  /** Confirmed, ended in (endedAfter, endedBefore], no check yet. Global (cron). */
  listDueAppointments(args: { endedBefore: ISODateTime; endedAfter: ISODateTime; limit: number }): Promise<AttendanceDueRow[]>;
  /** Every pending question of every business, oldest first. Global (cron). */
  listPendingChecks(limit: number): Promise<AttendanceCheckRow[]>;
  listPendingChecksForBusiness(businessId: UUID): Promise<AttendanceCheckRow[]>;
  getCheck(businessId: UUID, checkId: UUID): Promise<AttendanceCheckRow | null>;
  /** false when the appointment already has a question (unique appointment_id) */
  insertCheck(check: NewAttendanceCheck): Promise<boolean>;
  markEscalated(businessId: UUID, checkId: UUID, at: ISODateTime): Promise<boolean>;
  markNotified(businessId: UUID, checkIds: UUID[], at: ISODateTime): Promise<void>;
  /** Pending -> answered; false when it was no longer pending */
  answerCheck(args: {
    businessId: UUID;
    checkId: UUID;
    outcome: AttendanceOutcome | 'resolved_elsewhere';
    answeredBy: string | null;
    at: ISODateTime;
  }): Promise<boolean>;
  getBusinessContext(businessId: UUID): Promise<AttendanceBusinessContext | null>;
  /** Registered devices of the given users */
  listDeviceTokens(businessId: UUID, userIds: string[]): Promise<{ userId: string; token: string }[]>;
  listPushes(businessId: UUID, sinceIso: ISODateTime): Promise<AttendancePushRow[]>;
  recordPush(businessId: UUID, push: AttendancePushRow): Promise<void>;
}

export interface AttendancePushMessage {
  title: string;
  body: string;
  /** Expo notification category (action buttons) */
  categoryId?: string;
  data: Record<string, string>;
}

/** Expo push to specific users of a business. Best effort; resolves to the number of devices targeted. */
export interface AttendancePush {
  toUsers(businessId: UUID, userIds: string[], message: AttendancePushMessage): Promise<number>;
}

export interface AttendanceCaller {
  userId: string;
  role: MemberRole;
  businessId: UUID;
}

export interface AttendanceService {
  /** Open questions the caller must answer: their own, plus escalated / owner-mode ones for an owner */
  listPending(caller: AttendanceCaller): Promise<AttendancePendingResponse>;
  /** Recipient or owner answers; sets completed / no_show through BookingService. Idempotent per outcome. */
  answer(caller: AttendanceCaller, checkId: UUID, outcome: AttendanceOutcome): Promise<AttendanceCheckDTO>;
  /** Cron entry point; returns counts */
  runJob(now?: Date): Promise<Record<string, number>>;
}
