-- Stripe billing: new businesses default to plan none, billing_subscriptions is service-role only with
-- checked columns, the webhook dedupe table accepts source 'stripe'.
begin;

create temporary table fx (label text primary key, v jsonb) on commit drop;
grant select on fx to authenticated;

do $$
declare
  fa jsonb := tests.fixture('org_bill_a');
  ba uuid := (fa->>'business')::uuid;
begin
  insert into fx values ('a', fa);
  perform tests.eq((select plan::text from public.businesses where id = ba), 'none', 'a new business has plan none');
  perform tests.eq((select count(*) from public.business_features(ba))::int, 1, 'none resolves to a single row');
  perform tests.ok((select feature is null from public.business_features(ba)), 'none unlocks no feature');

  insert into public.billing_subscriptions (business_id, stripe_customer_id) values (ba, 'cus_test_1');
  perform tests.eq((select cancel_at_period_end from public.billing_subscriptions where business_id = ba), false, 'defaults: not cancelling');
  perform tests.throws(format($q$insert into public.billing_subscriptions (business_id, stripe_customer_id) values (%L, 'cus_other')$q$, ba),
    '23505', null, 'one billing row per business');
  perform tests.throws(format($q$update public.billing_subscriptions set stripe_customer_id = 'bad' where business_id = %L$q$, ba),
    '23514', null, 'customer ids must look like cus_');
  perform tests.throws(format($q$update public.billing_subscriptions set status = 'gold' where business_id = %L$q$, ba),
    '23514', null, 'status is one of the Stripe statuses');
  perform tests.throws(format($q$update public.billing_subscriptions set plan = 'free' where business_id = %L$q$, ba),
    '23514', null, 'the subscription tier is a paid plan');
  update public.billing_subscriptions set status = 'active', plan = 'growth', stripe_subscription_id = 'sub_test_1' where business_id = ba;
  perform tests.eq((select plan::text from public.billing_subscriptions where business_id = ba), 'growth', 'service role stores the tier');

  insert into public.webhook_events (source, event_key, payload) values ('stripe', 'evt_test_1', '{}');
  perform tests.throws($q$insert into public.webhook_events (source, event_key, payload) values ('stripe', 'evt_test_1', '{}')$q$,
    '23505', null, 'a replayed Stripe event id is rejected (dedupe)');
  perform tests.throws($q$insert into public.webhook_events (source, event_key, payload) values ('paypal', 'x', '{}')$q$,
    '23514', null, 'unknown webhook sources are still rejected');
end
$$;

-- ---------------------------------------------------------------- meter reporting (every booking counts)
do $$
declare
  fa jsonb := (select v from fx where label = 'a');
  ba uuid := (fa->>'business')::uuid;
  confirmed public.appointments;
  cancelled public.appointments;
  noshow public.appointments;
  early public.appointments;
  moved public.appointments;
begin
  confirmed := tests.book(fa, 'staff_a', 'service_short', 'client_1', '2031-03-31 09:00Z');
  cancelled := tests.book(fa, 'staff_a', 'service_short', 'client_2', '2031-03-31 11:00Z');
  noshow := tests.book(fa, 'staff_a', 'service_short', 'client_2', '2031-03-31 13:00Z');
  early := tests.book(fa, 'staff_a', 'service_short', 'client_1', '2031-03-01 09:00Z');
  moved := tests.book(fa, 'staff_a', 'service_short', 'client_1', '2031-04-02 09:00Z');
  update public.appointments set status = 'cancelled', cancelled_at = now() where id = cancelled.id;
  update public.appointments set status = 'no_show' where id = noshow.id;
  update public.appointments set created_at = '2031-03-10 00:00Z' where id = early.id;
  update public.appointments set created_at = '2031-03-20 00:00Z' where id in (confirmed.id, cancelled.id, noshow.id, moved.id);

  perform tests.eq((select count(*) from public.billing_unreported_bookings('2000-01-01'))::int, 0,
                   'nothing is reported before reporting_started_at is set');

  update public.billing_subscriptions set reporting_started_at = '2031-03-15 00:00Z' where business_id = ba;
  perform tests.eq((select count(*) from public.billing_unreported_bookings('2000-01-01'))::int, 4,
                   'cancelled and no_show bookings count too; only bookings created before the start are left out');
  perform tests.ok(not exists (select 1 from public.billing_unreported_bookings('2000-01-01') where appointment_id = early.id),
                   'a booking created before reporting started is never reported');
  perform tests.eq((select stripe_customer_id from public.billing_unreported_bookings('2000-01-01') limit 1), 'cus_test_1',
                   'the customer id comes with the booking');
  perform tests.eq((select count(*) from public.billing_unreported_bookings('2031-03-20 00:00Z'))::int, 0,
                   'p_created_after is exclusive (the 35 day horizon)');
  perform tests.eq((select count(*) from public.billing_unreported_bookings('2000-01-01', 2))::int, 2, 'limit applies');

  -- a reschedule moves the same row: still one booking, and it keeps its reported state
  perform public.mark_bookings_billed(array[moved.id], '2031-04-05 00:00Z');
  perform public.reschedule_appointment(moved.id, '2031-04-03 09:00Z', 'staff', 'user_test');
  perform tests.eq((select count(*) from public.appointments where business_id = ba and id = moved.id)::int, 1, 'reschedule keeps one row');
  perform tests.ok(not exists (select 1 from public.billing_unreported_bookings('2000-01-01') where appointment_id = moved.id),
                   'a rescheduled booking is not reported again');

  perform tests.eq(public.mark_bookings_billed(array[confirmed.id], '2031-04-05 00:00Z'), 1, 'marking stamps the booking');
  perform tests.eq(public.mark_bookings_billed(array[confirmed.id], '2031-04-06 00:00Z'), 0, 'marking twice is a no-op');
  perform tests.eq((select billing_reported_at from public.appointments where id = confirmed.id), '2031-04-05 00:00Z'::timestamptz, 'first stamp is kept');
  perform tests.eq((select count(*) from public.billing_unreported_bookings('2000-01-01'))::int, 2, 'reported bookings leave the worklist');

  update public.billing_subscriptions set status = 'canceled' where business_id = ba;
  perform tests.eq((select count(*) from public.billing_unreported_bookings('2000-01-01'))::int, 0, 'a canceled subscription reports nothing');
  update public.billing_subscriptions set status = 'past_due' where business_id = ba;
  perform tests.eq((select count(*) from public.billing_unreported_bookings('2000-01-01'))::int, 2, 'past_due is still entitled, so still reported');
  delete from public.billing_subscriptions where business_id = ba;
  perform tests.eq((select count(*) from public.billing_unreported_bookings('2000-01-01'))::int, 0, 'no subscription row reports nothing');
  insert into public.billing_subscriptions (business_id, stripe_customer_id, status) values (ba, 'cus_test_1', 'active');
end
$$;

select tests.as_member('{"sub": "bill_owner_a", "org_id": "org_bill_a", "role": "authenticated"}');
do $$
declare
  fa jsonb := (select v from fx where label = 'a');
begin
  perform tests.throws('select * from public.billing_subscriptions', '42501', null, 'authenticated cannot read billing rows');
  perform tests.throws($q$select * from public.billing_unreported_bookings('2000-01-01')$q$, '42501', null, 'authenticated cannot list unreported bookings');
  perform tests.throws($q$select public.mark_bookings_billed(array[gen_random_uuid()], now())$q$, '42501', null, 'authenticated cannot mark bookings billed');
  perform tests.throws(format($q$insert into public.billing_subscriptions (business_id, stripe_customer_id) values (%L, 'cus_x')$q$, fa->>'business'),
    '42501', null, 'authenticated cannot write billing rows');
  perform tests.throws(format($q$update public.businesses set plan = 'pro' where id = %L$q$, fa->>'business'),
    '42501', null, 'authenticated cannot change its own plan');
end
$$;

select tests.as_anon();
do $$
begin
  perform tests.throws('select * from public.billing_subscriptions', '42501', null, 'anon cannot read billing rows');
end
$$;

select tests.as_admin();
rollback;
