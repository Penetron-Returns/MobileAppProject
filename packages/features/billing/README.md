# billing

Stripe subscriptions for the paid plans, behind ports. Design and contract: `docs/BUILD_PLAN.md` "Billing (Stripe)".

- `ports.ts`: `BillingService` (checkout, portal, webhook events, usage sweep), `BookingMeter` (told about every created booking), `BillingSummary` (what the plan listing shows), `StripeClient`, `BillingRepository`.
- `services/billingService.ts`: the use cases (checkout, portal, webhook, meter). `services/planChange.ts`: plan change preview, paid-now upgrades (`pending_if_incomplete`) and period-end downgrades through a Stripe Subscription Schedule. Access policy lives in `lib/policy.ts` (`past_due` keeps access, `canceled` and friends go back to plan `none`).
- `services/stripeHttpClient.ts`: `StripeClient` over `fetch` (no `stripe` package, so no new Edge dependency). Meter events retry 429 and 5xx with backoff.
- `services/billingRepository.ts`: Supabase implementation (service role only: `billing_subscriptions`, `businesses.plan`, the `billing_unreported_bookings` / `mark_bookings_billed` RPCs).
- `lib/stripeSignature.ts`: `Stripe-Signature` verification on the raw body; `lib/stripeObjects.ts`: narrowing of Stripe payloads; `lib/config.ts`: env to `BillingConfig`.
- Fakes: `packages/testing/billing.ts` (`createFakeStripe`, `createMemoryBillingRepository`).

Every booking made is one meter event (`booking:<appointmentId>`), whatever its source or outcome; a reschedule is the same appointment. Bookings that change after they were reported are not adjusted.
