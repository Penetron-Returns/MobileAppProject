import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { qk } from '@/lib/query';

/** The month's report (`reports` feature). Counts only; money is integer cents. */
export function useReportsSummary(month: string) {
  return useQuery({
    queryKey: qk.report(month),
    queryFn: () => api.reportsSummary(month),
  });
}
