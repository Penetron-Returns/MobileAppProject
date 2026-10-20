/** Reports ports: the monthly figures behind GET /v1/reports/summary. `month` is `YYYY-MM` in the business timezone. */
import type { BusiestSlotDTO, MonthKey, ReportsSummaryDTO, UUID, WeeklyJobsDTO } from '@booking/types';

/** Raw month statistics from `month_report` (our own data, business timezone). */
export interface MonthStats {
  completed_jobs: number;
  revenue_cents: number;
  /** Counted by the appointment's `source` column; `app` = created by staff in the app */
  bookings_created: { whatsapp: number; app: number; web: number };
  no_shows: number;
  cancellations: number;
  busiest: BusiestSlotDTO | null;
  weekly: WeeklyJobsDTO[];
}

export interface BusinessReportProfile {
  timezone: string;
  currency: string;
}

export interface ReportRepository {
  /** NOT_FOUND for an unknown business */
  getProfile(businessId: UUID): Promise<BusinessReportProfile>;
  getMonthStats(businessId: UUID, month: MonthKey, now: Date): Promise<MonthStats>;
}

export interface ReportService {
  /** `month` defaults to the current month in the business timezone; VALIDATION_FAILED when malformed */
  getReport(businessId: UUID, month?: MonthKey): Promise<ReportsSummaryDTO>;
}
