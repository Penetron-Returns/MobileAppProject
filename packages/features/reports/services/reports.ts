/** The monthly report: our own booking figures for one business and month. */
import type { MonthKey, ReportsSummaryDTO, UUID } from '@booking/types';
import { AppError } from '../../lib/errors.ts';
import { currentMonth, isMonthKey } from '../lib/month.ts';
import type { ReportRepository, ReportService } from '../ports.ts';

export function createReportService(deps: { repo: ReportRepository; clock: () => Date }): ReportService {
  const { repo, clock } = deps;

  return {
    async getReport(businessId: UUID, requested?: MonthKey): Promise<ReportsSummaryDTO> {
      if (requested !== undefined && !isMonthKey(requested)) throw new AppError('VALIDATION_FAILED', 'month must be YYYY-MM');
      const profile = await repo.getProfile(businessId);
      const month = requested ?? currentMonth(clock(), profile.timezone);
      const stats = await repo.getMonthStats(businessId, month, clock());
      return {
        month,
        currency: profile.currency,
        completed_jobs: stats.completed_jobs,
        revenue_cents: stats.revenue_cents,
        bookings_created: {
          whatsapp: stats.bookings_created.whatsapp,
          manual: stats.bookings_created.app,
          web: stats.bookings_created.web,
        },
        no_shows: stats.no_shows,
        cancellations: stats.cancellations,
        busiest: stats.busiest,
        weekly: stats.weekly,
      };
    },
  };
}
