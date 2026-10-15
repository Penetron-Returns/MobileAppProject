# plans

Entitlements. The database (`plan_features` through `business_features()`) is the single source of truth; this feature only reads it. Callers ask whether a business has feature X, never which plan it is on. `hasFeatureOrNone` is for gates that treat an unknown business as not entitled.

## Usage and reports

- `lib/planCatalog.ts`: names, prices, included completed jobs and the R4 extra-job price (Free has no allowance).
- `lib/usage.ts`: pure `computeUsage` (normal below 80%, near from 80% to 100%, over beyond, never a cut-off) and month helpers.
- `services/usage.ts` (`UsageService`) over `PlanRepository` (`services/planRepository.ts`: `completed_jobs_in_month` and `month_report` RPCs). A completed job is an appointment whose end has passed in the business-timezone month and that is not cancelled or no-show.
