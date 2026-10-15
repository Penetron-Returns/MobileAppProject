-- =============================================================================
-- Demo seed: "Ashgrove Hair & Beauty" (from the mockups).
-- Runs after the migrations on `supabase db reset` and in scripts/db/test.sh.
-- Appointments are placed relative to now() in the business timezone (last
-- week, this week, next week) so the demo always looks current, and they are
-- written through the same RPCs the API uses, so every constraint applies.
-- Fixed ids make the demo addressable from app/API tests:
--   business 10000000-0000-4000-8000-000000000001 (org_demo_ashgrove, plan free)
--   business 10000000-0000-4000-8000-000000000002 (org_demo_harbour, plan growth, bare)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Business
-- -----------------------------------------------------------------------------
insert into public.businesses (id, clerk_org_id, name, slug, timezone, currency, address, phone, email, plan)
values (
  '10000000-0000-4000-8000-000000000001', 'org_demo_ashgrove', 'Ashgrove Hair & Beauty', 'ashgrove',
  'Africa/Johannesburg', 'ZAR', '14 Ashgrove Lane, Rondebosch, Cape Town, 7700',
  '+27215550199', 'hello@ashgrove.example', 'free'
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Members (mirrored from Clerk)
-- -----------------------------------------------------------------------------
insert into public.users (id, business_id, role, email, display_name)
values
  ('user_demo_emma',   '10000000-0000-4000-8000-000000000001', 'owner', 'emma@ashgrove.example',   'Emma Thompson'),
  ('user_demo_marcus', '10000000-0000-4000-8000-000000000001', 'staff', 'marcus@ashgrove.example', 'Marcus Chen')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Services (price in cents, ZAR)
-- -----------------------------------------------------------------------------
insert into public.services (id, business_id, name, description, category, duration_minutes, price_cents, sort_order)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Women''s Haircut',
     'Consultation, wash, cut and blow-dry.', 'Hair', 60, 85000, 10),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Men''s Haircut',
     'Cut, wash and style.', 'Hair', 45, 55000, 20),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'Balayage & Toner',
     'Hand-painted balayage with gloss toner.', 'Hair', 180, 220000, 30),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'Haircut & Styling',
     'Precision cut with an occasion finish.', 'Hair', 75, 95000, 40),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'Full Colour & Blowout',
     'Root-to-tip colour and a bouncy blowout.', 'Hair', 90, 140000, 50),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'Gel Manicure',
     'Shape, cuticle care and gel polish.', 'Nails', 45, 45000, 60),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'Spa Pedicure',
     'Soak, exfoliation, massage and polish.', 'Nails', 60, 65000, 70),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'Deep Tissue Massage',
     'Full-body deep tissue massage.', 'Wellness', 60, 75000, 80),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000001', 'Signature Facial',
     'Cleanse, peel, mask and hydration.', 'Wellness', 60, 70000, 90)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Staff
-- -----------------------------------------------------------------------------
insert into public.staff (id, business_id, user_id, name, title, color, is_active, accepts_bookings, sort_order)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'user_demo_emma',
     'Emma Thompson', 'Senior Colourist', '#C2410C', true, true, 10),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'user_demo_marcus',
     'Marcus Chen', 'Master Stylist', '#1D4ED8', true, true, 20),
  -- On leave: still active, but not taking bookings.
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', null,
     'Sarah Jenkins', 'Junior Stylist', '#7C3AED', true, false, 30),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', null,
     'Amara S.', 'Beauty & Wellness Therapist', '#047857', true, true, 40)
on conflict (id) do nothing;

select count(*) from public.replace_staff_services('30000000-0000-4000-8000-000000000001', array[
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005']::uuid[]);
select count(*) from public.replace_staff_services('30000000-0000-4000-8000-000000000002', array[
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000004']::uuid[]);
select count(*) from public.replace_staff_services('30000000-0000-4000-8000-000000000003', array[
  '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000004']::uuid[]);
select count(*) from public.replace_staff_services('30000000-0000-4000-8000-000000000004', array[
  '20000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000007',
  '20000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000009']::uuid[]);

-- -----------------------------------------------------------------------------
-- Opening hours: Mon–Sat 09:00–18:00 (one range per day), Sunday closed (no row).
-- Emma/Marcus/Sarah inherit these (no rules); Amara works Tue–Sat 09:00–17:00.
-- Lunch is a staff break, not a gap in the opening hours.
-- -----------------------------------------------------------------------------
select count(*) from public.replace_business_hours('10000000-0000-4000-8000-000000000001', '[
  {"weekday": 1, "opens_at": "09:00", "closes_at": "18:00"},
  {"weekday": 2, "opens_at": "09:00", "closes_at": "18:00"},
  {"weekday": 3, "opens_at": "09:00", "closes_at": "18:00"},
  {"weekday": 4, "opens_at": "09:00", "closes_at": "18:00"},
  {"weekday": 5, "opens_at": "09:00", "closes_at": "18:00"},
  {"weekday": 6, "opens_at": "09:00", "closes_at": "18:00"}
]'::jsonb);

select count(*) from public.replace_staff_availability('30000000-0000-4000-8000-000000000004', '[
  {"weekday": 2, "start_time": "09:00", "end_time": "17:00"},
  {"weekday": 3, "start_time": "09:00", "end_time": "17:00"},
  {"weekday": 4, "start_time": "09:00", "end_time": "17:00"},
  {"weekday": 5, "start_time": "09:00", "end_time": "17:00"},
  {"weekday": 6, "start_time": "09:00", "end_time": "17:00"}
]'::jsonb);

-- Lunch 13:00–14:00 Mon–Fri for Emma, Marcus and Sarah; Amara 12:00–13:00 on her days.
select count(*)
  from (values ('30000000-0000-4000-8000-000000000001'::uuid), ('30000000-0000-4000-8000-000000000002'::uuid),
               ('30000000-0000-4000-8000-000000000003'::uuid)) as s(id),
       lateral public.replace_staff_breaks(s.id, '[{"label": "Lunch", "start_time": "13:00", "end_time": "14:00", "weekdays": [1, 2, 3, 4, 5]}]'::jsonb);
select count(*) from public.replace_staff_breaks('30000000-0000-4000-8000-000000000004',
  '[{"label": "Lunch", "start_time": "12:00", "end_time": "13:00", "weekdays": [2, 3, 4, 5, 6]}]'::jsonb);

-- Time off: Marcus on a two-day course, Amara at the dentist one afternoon (both in the near future).
insert into public.staff_time_off (id, business_id, staff_id, starts_on, ends_on, start_time, end_time, reason, note)
values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   (now() at time zone 'Africa/Johannesburg')::date + 12, (now() at time zone 'Africa/Johannesburg')::date + 13,
   null, null, 'training', 'Colour masterclass'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004',
   (now() at time zone 'Africa/Johannesburg')::date + 5, (now() at time zone 'Africa/Johannesburg')::date + 5,
   '14:00', '16:00', 'other', 'Dentist')
on conflict (id) do nothing;

insert into public.business_special_days (id, business_id, date, name, kind, is_closed)
values ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        (date_trunc('month', now() at time zone 'Africa/Johannesburg') + interval '1 month 15 days')::date,
        'Staff training day', 'closure', true)
on conflict (business_id, date) do nothing;

-- -----------------------------------------------------------------------------
-- Clients
-- -----------------------------------------------------------------------------
insert into public.clients (id, business_id, phone_e164, name, email, notes, tags, first_seen_at, last_seen_at)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '+27821234567',
     'Olivia Bennett', 'olivia.bennett@example.com', 'Prefers Emma for colour. Likes a strong espresso.',
     array['VIP'], now() - interval '400 days', now() - interval '2 days'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '+27831112222',
     'James Wilson', null, 'Short back and sides, no. 2 on the clipper.',
     '{}', now() - interval '200 days', now() - interval '6 days'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '+27719876543',
     'Sophia Naidoo', 'sophia.n@example.com', 'Bridal party in December.',
     array['VIP'], now() - interval '320 days', now() - interval '1 day'),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '+27605551234',
     'Thabo Mokoena', null, null, '{}', now() - interval '45 days', now() - interval '3 days'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '+27724443333',
     'Lerato Dlamini', 'lerato.d@example.com', 'Sensitive scalp.', '{}',
     now() - interval '90 days', now() - interval '20 minutes'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '+27846667777',
     'Daniel Botha', null, null, '{}', now() - interval '12 days', now() - interval '5 days'),
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '+27829990000',
     'Kyle Pretorius', null, 'Blocked after repeated no-shows.', '{}',
     now() - interval '150 days', now() - interval '30 days')
on conflict (id) do nothing;

insert into public.client_notes (id, business_id, client_id, body, kind, created_by)
values
  ('41000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000001', 'Allergic to PPD: patch test 48h before any colour service.',
     'warning', 'user_demo_emma'),
  ('41000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000001', 'Prefers a cool-toned blonde; avoid brassiness.',
     'preference', 'user_demo_emma'),
  ('41000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000005', 'Use the gentle shampoo; scalp reacts to sulphates.',
     'warning', 'user_demo_marcus'),
  ('41000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000003', 'Bridal trial booked for November; wants loose curls.',
     'general', 'user_demo_emma')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Appointments: last week (all past), this week (relative to now), next week
-- (all future). Only seeded once per business.
-- -----------------------------------------------------------------------------
do $$
declare
  c_business constant uuid := '10000000-0000-4000-8000-000000000001';
  c_tz       constant text := 'Africa/Johannesburg';
  v_monday   date := date_trunc('week', now() at time zone c_tz)::date;  -- ISO week starts Monday
  v_week     int;
  v_tpl      record;
  v_starts   timestamptz;
  v_appt     public.appointments;
begin
  if exists (select 1 from public.appointments where business_id = c_business) then
    raise notice 'demo appointments already seeded; skipping';
    return;
  end if;

  -- day: 0 = Monday … 5 = Saturday. outcome applies once the appointment has ended.
  create temporary table seed_appointments (
    code text, client int, staff int, service int, day int, at time, outcome text, notes text
  ) on commit drop;
  insert into seed_appointments values
    ('01', 1, 1, 3, 0, '09:00', 'completed', 'Balayage refresh'),
    ('02', 2, 2, 2, 0, '09:30', 'completed', null),
    ('03', 4, 2, 4, 0, '10:30', 'no_show',   null),
    ('04', 3, 1, 1, 0, '14:00', 'completed', null),
    ('05', 5, 4, 6, 1, '09:00', 'completed', null),
    ('06', 3, 4, 9, 1, '10:00', 'completed', null),
    ('07', 6, 2, 2, 1, '11:00', 'cancelled', null),
    ('08', 1, 1, 1, 1, '15:00', 'completed', null),
    ('09', 2, 2, 4, 2, '09:00', 'completed', null),
    ('10', 5, 1, 5, 2, '10:00', 'completed', 'Going darker for winter'),
    ('11', 1, 4, 8, 3, '11:00', 'completed', null),
    ('12', 4, 2, 2, 3, '14:00', 'completed', null),
    ('13', 3, 1, 3, 3, '14:00', 'completed', null),
    ('14', 6, 2, 4, 4, '09:00', 'completed', null),
    ('15', 5, 4, 7, 4, '10:00', 'completed', null),
    ('16', 2, 1, 1, 4, '12:00', 'completed', null),
    ('17', 1, 4, 6, 4, '14:00', 'completed', null),
    ('18', 3, 2, 1, 5, '09:00', 'completed', null),
    ('19', 4, 1, 5, 5, '10:00', 'no_show',   null),
    ('20', 5, 4, 9, 5, '11:00', 'completed', null),
    ('21', 6, 2, 2, 5, '13:00', 'cancelled', null);

  for v_week in -1 .. 1 loop
    for v_tpl in select * from seed_appointments order by day, at, code loop
      -- next week: keep it lighter (every other booking)
      continue when v_week = 1 and (v_tpl.code::int % 2) = 0;

      v_starts := ((v_monday + 7 * v_week + v_tpl.day) + v_tpl.at) at time zone c_tz;
      v_appt := public.create_appointment(
        p_business_id     => c_business,
        p_client_id       => ('40000000-0000-4000-8000-00000000000' || v_tpl.client)::uuid,
        p_staff_id        => ('30000000-0000-4000-8000-00000000000' || v_tpl.staff)::uuid,
        p_service_id      => ('20000000-0000-4000-8000-00000000000' || v_tpl.service)::uuid,
        p_starts_at       => v_starts,
        p_source          => (array['whatsapp', 'app', 'web', 'whatsapp']::public.appointment_source[])
                               [1 + (v_tpl.code::int % 4)],
        p_idempotency_key => format('seed:%s:%s', v_week, v_tpl.code),
        p_actor           => 'staff',
        p_actor_id        => 'user_demo_emma',
        p_notes           => v_tpl.notes
      );

      if v_tpl.outcome = 'cancelled' then
        perform public.cancel_appointment(v_appt.id, 'customer', v_appt.client_id::text,
                                          'Client requested via WhatsApp');
      elsif upper(v_appt.slot) <= now() then
        perform public.check_in_appointment(v_appt.id, 'user_demo_emma')
          where v_tpl.outcome = 'completed';
        perform public.set_appointment_status(v_appt.id, v_tpl.outcome::public.appointment_status,
                                              'staff', 'user_demo_emma');
      elsif lower(v_appt.slot) <= now() then
        -- in the chair right now
        perform public.check_in_appointment(v_appt.id, 'user_demo_emma');
      end if;
    end loop;
  end loop;

  -- Kyle: a no-show last week, then blocked.
  v_appt := public.create_appointment(
    c_business, '40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002', ((v_monday - 7 + 2) + time '16:00') at time zone c_tz,
    'whatsapp', 'seed:kyle', 'customer', '40000000-0000-4000-8000-000000000007');
  perform public.set_appointment_status(v_appt.id, 'no_show', 'staff', 'user_demo_marcus');
  update public.clients set is_blocked = true where id = '40000000-0000-4000-8000-000000000007';
end
$$;

-- -----------------------------------------------------------------------------
-- WhatsApp: account connected-in-progress (pending, no token yet) + drafts.
-- -----------------------------------------------------------------------------
insert into public.whatsapp_accounts (id, business_id, waba_id, phone_number_id, display_phone, status)
values ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        'demo-waba-ashgrove', 'demo-phone-ashgrove', '+27 21 555 0199', 'pending')
on conflict (id) do nothing;

insert into public.message_templates (business_id, whatsapp_account_id, name, category, language, status)
select '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', t.name, 'UTILITY', 'en', 'draft'
  from unnest(array['booking_confirmation', 'booking_reminder', 'booking_rescheduled', 'booking_cancelled']) as t(name)
on conflict (whatsapp_account_id, name, language) do nothing;

-- -----------------------------------------------------------------------------
-- Inbox: Lerato asked to talk to a person → escalated conversation.
-- James: a quiet, closed thread.
-- -----------------------------------------------------------------------------
insert into public.conversations (id, business_id, client_id, state, context, version,
                                  window_expires_at, last_inbound_at, last_message_at)
values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000005', 'escalated', '{"escalation_reason": "customer_requested"}', 3,
     now() - interval '20 minutes' + interval '24 hours', now() - interval '20 minutes', now() - interval '19 minutes'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000002', 'closed', '{}', 6,
     now() - interval '6 days' + interval '24 hours', now() - interval '6 days', now() - interval '6 days')
on conflict (id) do nothing;

insert into public.messages (id, business_id, conversation_id, direction, wa_message_id, type, body, status,
                             sent_at, delivered_at, read_at, created_at)
values
  ('61000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
     '60000000-0000-4000-8000-000000000001', 'in', 'wamid.DEMO-IN-0001', 'text',
     '{"text": "Hi! Can I bring my daughter along for a trim too?"}', 'received',
     null, null, null, now() - interval '22 minutes'),
  ('61000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
     '60000000-0000-4000-8000-000000000001', 'out', 'wamid.DEMO-OUT-0001', 'interactive',
     '{"interactive": {"type": "button", "body": "Hi Lerato! How can we help?", "buttons": [{"id": "menu:book", "title": "Book"}, {"id": "menu:bookings", "title": "My bookings"}, {"id": "menu:help", "title": "Talk to us"}]}}',
     'read', now() - interval '22 minutes', now() - interval '22 minutes', now() - interval '21 minutes',
     now() - interval '22 minutes'),
  ('61000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
     '60000000-0000-4000-8000-000000000001', 'in', 'wamid.DEMO-IN-0002', 'button',
     '{"button": {"id": "menu:help", "title": "Talk to us"}}', 'received',
     null, null, null, now() - interval '20 minutes'),
  ('61000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001',
     '60000000-0000-4000-8000-000000000001', 'out', 'wamid.DEMO-OUT-0002', 'text',
     '{"text": "Thanks! A member of our team will reply here shortly."}', 'delivered',
     now() - interval '19 minutes', now() - interval '19 minutes', null, now() - interval '19 minutes'),
  ('61000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001',
     '60000000-0000-4000-8000-000000000002', 'out', 'wamid.DEMO-OUT-0003', 'template',
     '{"template": {"name": "booking_confirmation", "language": "en"}}', 'read',
     now() - interval '6 days', now() - interval '6 days', now() - interval '6 days', now() - interval '6 days')
on conflict (id) do nothing;

insert into public.escalations (id, business_id, conversation_id, client_id, reason, status, note)
values ('62000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000005',
        'customer_requested', 'open', null)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Research instrumentation (FR21): one completed web attempt, one abandoned
-- WhatsApp attempt.
-- -----------------------------------------------------------------------------
insert into public.booking_attempts (id, business_id, channel, client_id, conversation_id, session_key,
                                     started_at, completed_at, step_count, outcome, appointment_id, steps)
select '80000000-0000-4000-8000-000000000001', a.business_id, 'web', a.client_id, null, 'web-demo-session-1',
       a.created_at - interval '3 minutes', a.created_at, 5, 'completed', a.id,
       jsonb_build_array(
         jsonb_build_object('step', 'service',  'at', a.created_at - interval '180 seconds'),
         jsonb_build_object('step', 'staff',    'at', a.created_at - interval '150 seconds'),
         jsonb_build_object('step', 'date',     'at', a.created_at - interval '110 seconds'),
         jsonb_build_object('step', 'slot',     'at', a.created_at - interval '70 seconds'),
         jsonb_build_object('step', 'confirm',  'at', a.created_at))
  from public.appointments a
 where a.idempotency_key = 'seed:0:02'
on conflict (id) do nothing;

insert into public.booking_attempts (id, business_id, channel, client_id, conversation_id, started_at,
                                     step_count, outcome, steps)
values ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'whatsapp',
        '40000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000001',
        now() - interval '2 days', 2, 'abandoned',
        jsonb_build_array(jsonb_build_object('step', 'menu:book', 'at', now() - interval '2 days'),
                          jsonb_build_object('step', 'select_service', 'at', now() - interval '2 days' + interval '40 seconds')))
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Second demo business on a paid plan (companion + desktop, no inbox / WhatsApp
-- menu). Deliberately bare: it exists to exercise plan gating.
-- -----------------------------------------------------------------------------
insert into public.businesses (id, clerk_org_id, name, slug, plan)
values ('10000000-0000-4000-8000-000000000002', 'org_demo_harbour', 'Harbour Barbers', 'harbour', 'growth')
on conflict (id) do nothing;

-- Upcoming South African public holidays (Public Holidays Act 36 of 1994: a holiday that falls on a
-- Sunday moves to the Monday) as closed special days for both demo businesses, plus a training day.
create or replace function pg_temp.easter(p_year int) returns date language sql immutable as $$
  with a as (select p_year % 19 as a, p_year / 100 as b, p_year % 100 as c),
       d as (select a.a, a.b, a.c, a.b / 4 as d, a.b % 4 as e, (a.b + 8) / 25 as f from a),
       g as (select d.*, (d.b - d.f + 1) / 3 as g from d),
       h as (select g.*, (19 * g.a + g.b - g.d - g.g + 15) % 30 as h from g),
       i as (select h.*, h.c / 4 as i, h.c % 4 as k from h),
       l as (select i.*, (32 + 2 * i.e + 2 * i.i - i.h - i.k) % 7 as l from i),
       m as (select l.*, (l.a + 11 * l.h + 22 * l.l) / 451 as m from l)
  select make_date(p_year, (m.h + m.l - 7 * m.m + 114) / 31, ((m.h + m.l - 7 * m.m + 114) % 31) + 1) from m
$$;

insert into public.business_special_days (business_id, date, name, kind, is_closed)
select b.id, hd.d, hd.name, 'public_holiday', true
  from (values ('10000000-0000-4000-8000-000000000001'::uuid), ('10000000-0000-4000-8000-000000000002'::uuid)) as b(id)
 cross join lateral (
   select case when extract(dow from raw.d) = 0 then raw.d + 1 else raw.d end as d,
          case when extract(dow from raw.d) = 0 then raw.name || ' (observed)' else raw.name end as name
     from (
       select make_date(y, m, dd) as d, name
         from generate_series(extract(year from now())::int, extract(year from now())::int + 1) as y
        cross join (values (1, 1, 'New Year''s Day'), (3, 21, 'Human Rights Day'), (4, 27, 'Freedom Day'),
                           (5, 1, 'Workers'' Day'), (6, 16, 'Youth Day'), (8, 9, 'National Women''s Day'),
                           (9, 24, 'Heritage Day'), (12, 16, 'Day of Reconciliation'),
                           (12, 25, 'Christmas Day'), (12, 26, 'Day of Goodwill')) as f(m, dd, name)
       union all
       select pg_temp.easter(y) - 2, 'Good Friday' from generate_series(extract(year from now())::int, extract(year from now())::int + 1) as y
       union all
       select pg_temp.easter(y) + 1, 'Family Day' from generate_series(extract(year from now())::int, extract(year from now())::int + 1) as y
     ) as raw
 ) as hd
 where hd.d >= (now() at time zone 'Africa/Johannesburg')::date
on conflict (business_id, date) do nothing;
