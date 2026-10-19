# reports

The monthly figures behind `GET /v1/reports/summary`: completed jobs, revenue, bookings created by source, no-shows,
cancellations, busiest slot and weekly job counts. The numbers come from the `month_report` RPC (business timezone,
Monday-start weeks); the service only picks the month and shapes the DTO.

| Path                          | What                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `ports.ts`                    | `ReportRepository`, `ReportService`, `MonthStats`     |
| `lib/month.ts`                | Month key validation and the business-local month     |
| `services/reports.ts`         | `createReportService`                                 |
| `services/reportRepository.ts`| Supabase repository and the `month_report` parser     |

Tests use `@booking/testing/reportsMemory.ts`, which mirrors the SQL month and week boundaries.
