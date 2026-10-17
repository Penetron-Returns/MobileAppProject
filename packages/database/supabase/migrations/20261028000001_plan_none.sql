-- =============================================================================
-- Plan 'none': a business that has not chosen (or no longer has) a paid plan.
-- There is no free tier for new businesses and no trial: onboarding creates
-- 'none' and the app shows only the plan chooser until Stripe confirms a
-- subscription. 'free' stays in the enum for existing rows (back-compat).
-- ADD VALUE is its own file: a new enum value cannot be used in the transaction
-- that adds it (the default and the function change are in the next migration).
-- =============================================================================
alter type public.plan_key add value if not exists 'none' before 'free';
