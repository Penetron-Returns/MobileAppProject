# plans

Entitlements. The database (`plan_features` through `business_features()`) is the single source of truth; this feature only reads it. Callers ask whether a business has feature X, never which plan it is on. `hasFeatureOrNone` is for gates that treat an unknown business as not entitled.

## Usage and reports

- `lib/planCatalog.ts`: names, prices, included bookings and the R4 extra-booking price (Free and `none` have no allowance).
- `lib/usage.ts`: pure `computeUsage` (normal below 80%, near from 80% to 100%, over beyond, never a cut-off) and month helpers.
- `services/usage.ts` (`UsageService`) over `PlanRepository` (`services/planRepository.ts`: `countBookingsCreated` and the `month_report` RPC). **Plans meter every booking made**: appointments created in the period (the Stripe billing period when a subscription is known, else the business-timezone calendar month), whatever their source or status. The report's `completed_jobs` stays a report figure and is not what the plan counts. Billing itself lives in `../billing/`.
