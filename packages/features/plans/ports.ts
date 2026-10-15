/** Plan entitlement and usage ports. */
import type {
  BillingUsageDTO,
  BusiestSlotDTO,
  EntitlementsDTO,
  FeatureKey,
  MonthKey,
  PlanKey,
  PlansDTO,
  ReportsSummaryDTO,
  UUID,
  WeeklyJobsDTO,
} from '@booking/types';

/** Resolves what a business's plan unlocks. Always a live read: plans can change at any time. */
export interface EntitlementService {
  getEntitlements(businessId: UUID): Promise<EntitlementsDTO>;
  hasFeature(businessId: UUID, feature: FeatureKey): Promise<boolean>;
  /** Businesses whose plan unlocks `feature`, ordered by id, strictly after `after` */
  listBusinessIdsWithFeature(feature: FeatureKey, opts: { after?: UUID; limit: number }): Promise<UUID[]>;
}

/** Raw month statistics from `month_report` (our own data, business timezone). */
export interface MonthStats {
  completed_jobs: number;
  revenue_cents: number;
  /** Counted by the appointment's `source` column; `app` = created by staff in the app */
  bookings_created: { whatsapp: number; nerova: number; app: number; web: number };
  no_shows: number;
  cancellations: number;
  busiest: BusiestSlotDTO | null;
  weekly: WeeklyJobsDTO[];
}

export interface BusinessPlanProfile {
  plan: PlanKey;
  timezone: string;
  currency: string;
  /** Cached Nerova `acct_` id, null until resolved */
  nerovaAccountId: string | null;
}

/** Persistence for plan usage. `month` is `YYYY-MM` in the business timezone. */
export interface PlanRepository {
  /** NOT_FOUND for an unknown business */
  getProfile(businessId: UUID): Promise<BusinessPlanProfile>;
  setNerovaAccountId(businessId: UUID, accountId: string): Promise<void>;
  /** Completed jobs of the month: ended by `now`, not cancelled, not no_show */
  countCompletedJobs(businessId: UUID, month: MonthKey, now: Date): Promise<number>;
  getMonthStats(businessId: UUID, month: MonthKey, now: Date): Promise<MonthStats>;
}

/** Usage, plan catalogue and the "our data" half of the reports screen. `month` defaults to the current one. */
export interface UsageService {
  getUsage(businessId: UUID, month?: MonthKey): Promise<BillingUsageDTO>;
  listPlans(businessId: UUID): Promise<PlansDTO>;
  /** Everything in the report except Nerova's `companion` outcomes (the route adds those) */
  getReport(businessId: UUID, month?: MonthKey): Promise<Omit<ReportsSummaryDTO, 'companion'>>;
}
