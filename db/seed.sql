-- Seed data for local development. Applied by `npm run db:reset`.
--
-- PLAN.md §10: 2 admins, 5 verified NGOs across Coimbatore pincodes, 4
-- volunteers, and 30 donations spread across every state, so every feature is
-- demoable from a fresh reset with no manual clicking.
--
-- Every seeded account signs in with the password:  password123
-- The hash below is scrypt (N=2^17, r=8, p=1) as produced by
-- server/src/lib/password.ts. Regenerate it there if those parameters change.

do $seed$
declare
  pw constant text :=
    'scrypt$131072$8$1$qovVAwh3gWP/dXZk8auPjA==$CjXAgwuGJGwiZez1RCopVZ0VEXaU+9WoVXrIEptXz4hB0CM67k+ooaq4iLXOTex7ykBA7I/YvNuPHOR4YV0YlA==';

  -- Coimbatore, spread across real pincodes and roughly real coordinates.
  -- Names are fictional but plausible for the city; "Kovai" is Coimbatore in Tamil.
  ngo_names constant text[] := array[
    'Kongu Nala Sangam', 'Noyyal Kalvi Maiyam', 'Kovai Anbu Illam',
    'Peelamedu Udhavi Trust', 'Vellalore Nammavar Sangam'
  ];
  ngo_pins constant text[] := array['641001', '641004', '641012', '641006', '641028'];
  ngo_lat constant double precision[] := array[11.0168, 11.0060, 11.0180, 11.0300, 11.0060];
  ngo_lng constant double precision[] := array[76.9558, 76.9490, 76.9660, 77.0080, 77.0290];
  -- Deliberately uneven, so the RLS category filter is visible on a fresh
  -- reset: signing in as NGO 4 must show a different wall from NGO 1.
  ngo_cats constant text[] := array[
    'clothes,books,toys,education,furniture,household',
    'clothes,toys,household',
    'clothes,furniture',
    'books,education',
    'books,toys,household'
  ];

  donor_names constant text[] := array[
    'Lakshmi Subramanian', 'Karthik Rajan', 'Divya Natarajan',
    'Arun Selvam', 'Meena Balakrishnan', 'Vignesh Kumar'
  ];
  vol_names constant text[] := array[
    'Prakash Murugan', 'Anitha Ravi', 'Suresh Palanisamy', 'Kavitha Shankar'
  ];

  titles constant text[] := array[
    'Winter jackets', 'School textbooks', 'Wooden puzzle set', 'Cotton sarees',
    'Story books for 8-10 year olds', 'Board games', 'Children''s sweaters',
    'Engineering reference books', 'Soft toys', 'Kurtas, barely worn',
    'Exam guides', 'Building blocks', 'Denim jeans', 'Tamil novels',
    'Toy cars', 'Study table', 'Steel almirah', 'Geometry boxes',
    'Mixer grinder', 'Stainless steel vessels', 'Plastic chairs',
    'Notebooks, unused', 'Ceiling fan', 'School bags', 'Bedsheets and pillow covers'
  ];

  cats constant text[] := array[
    'clothes', 'books', 'toys', 'education', 'furniture', 'household'
  ];

  statuses constant text[] := array[
    'posted','posted','posted','posted','posted','posted','posted','posted','posted','posted',
    'claimed','claimed','claimed','claimed',
    'scheduled','scheduled','scheduled',
    'in_transit','in_transit','in_transit',
    'received','received','received',
    'acknowledged','acknowledged','acknowledged',
    'cancelled','cancelled',
    'rejected','rejected'
  ];

  v_user uuid;
  v_profile uuid;
  v_admin_profiles uuid[] := '{}';
  v_ngo_ids uuid[] := '{}';
  v_ngo_profiles uuid[] := '{}';
  v_donor_profiles uuid[] := '{}';
  v_vol_ids uuid[] := '{}';
  v_donation uuid;
  v_status public.donation_status;
  v_ngo uuid;
  i integer;
  j integer;
  n_photos integer;
begin
  -- -------------------------------------------------------------------------
  -- Admins. Not self-registerable (app.register_user refuses the role), so they
  -- only ever come from here or from another admin's promotion.
  -- -------------------------------------------------------------------------
  for i in 1..2 loop
    insert into public.users (phone, password_hash)
    values ('900000000' || i::text, pw)
    returning id into v_user;

    insert into public.profiles (user_id, full_name, phone, role, pincode, lat, lng)
    values (v_user, 'Admin ' || i::text, '900000000' || i::text, 'admin', '641001', 11.0168, 76.9558)
    returning id into v_profile;

    v_admin_profiles := v_admin_profiles || v_profile;
  end loop;

  -- -------------------------------------------------------------------------
  -- Five verified NGOs.
  -- -------------------------------------------------------------------------
  for i in 1..5 loop
    insert into public.users (phone, password_hash)
    values ('910000000' || i::text, pw)
    returning id into v_user;

    insert into public.profiles (user_id, full_name, phone, role, pincode, lat, lng)
    values (v_user, ngo_names[i], '910000000' || i::text, 'ngo',
            ngo_pins[i], ngo_lat[i], ngo_lng[i])
    returning id into v_profile;

    v_ngo_profiles := v_ngo_profiles || v_profile;

    insert into public.ngos (
      profile_id, name, registration_number, darpan_id, has_80g, address, pincode,
      lat, lng, verification_status, verified_at, verified_by, monthly_capacity,
      accepts_categories, contact_person, contact_phone, is_accepting
    )
    values (
      v_profile, ngo_names[i], 'TN/2019/' || (1000 + i)::text, 'TN/2019/' || (5000 + i)::text,
      i % 2 = 1, ngo_names[i] || ', Coimbatore', ngo_pins[i], ngo_lat[i], ngo_lng[i],
      'verified', now() - (i || ' days')::interval, v_admin_profiles[1], 40 + i * 10,
      string_to_array(ngo_cats[i], ',')::public.donation_category[],
      ngo_names[i], '910000000' || i::text, true
    )
    returning id into v_ngo;

    v_ngo_ids := v_ngo_ids || v_ngo;
  end loop;

  -- -------------------------------------------------------------------------
  -- Four volunteers: three verified, one still pending so the admin queue in
  -- M7 has something in it on a fresh reset.
  -- -------------------------------------------------------------------------
  for i in 1..4 loop
    insert into public.users (phone, password_hash)
    values ('920000000' || i::text, pw)
    returning id into v_user;

    insert into public.profiles (user_id, full_name, phone, role, pincode, lat, lng)
    values (v_user, vol_names[i], '920000000' || i::text, 'volunteer',
            ngo_pins[i], ngo_lat[i] + 0.01, ngo_lng[i] - 0.01)
    returning id into v_profile;

    insert into public.volunteers (
      profile_id, verification_status, verified_at, verified_by, service_radius_km, available_slots
    )
    values (
      v_profile,
      (case when i = 4 then 'pending' else 'verified' end)::public.verification_status,
      case when i = 4 then null else now() - (i || ' days')::interval end,
      case when i = 4 then null else v_admin_profiles[1] end,
      6 + i,
      '{"mon":["morning"],"wed":["evening"],"sat":["morning","evening"]}'::jsonb
    )
    returning id into v_ngo;

    v_vol_ids := v_vol_ids || v_ngo;
  end loop;

  -- -------------------------------------------------------------------------
  -- Six donors.
  -- -------------------------------------------------------------------------
  for i in 1..6 loop
    insert into public.users (phone, password_hash)
    values ('930000000' || i::text, pw)
    returning id into v_user;

    insert into public.profiles (user_id, full_name, phone, role, pincode, lat, lng)
    values (v_user, donor_names[i], '930000000' || i::text, 'donor',
            ngo_pins[1 + (i % 5)], ngo_lat[1 + (i % 5)] + 0.005, ngo_lng[1 + (i % 5)] + 0.005)
    returning id into v_profile;

    v_donor_profiles := v_donor_profiles || v_profile;
  end loop;

  -- -------------------------------------------------------------------------
  -- Thirty donations, covering all eight states.
  -- -------------------------------------------------------------------------
  for i in 1..30 loop
    v_status := statuses[i]::public.donation_status;

    -- The claim-coherence CHECK requires an NGO on everything except posted
    -- and cancelled.
    -- NGO 1 accepts every category, so seeded claims are always coherent with
    -- the accepts_categories filter rather than only appearing to be.
    v_ngo := case
      when v_status in ('posted', 'cancelled') then null
      else v_ngo_ids[1]
    end;

    insert into public.donations (
      donor_id, title, description, category, quantity, condition,
      condition_checklist, pickup_address, pincode, lat, lng, status,
      claimed_by_ngo_id, claimed_at, claim_expires_at, delivery_method,
      rejected_reason, posted_at
    )
    values (
      v_donor_profiles[1 + (i % 6)],
      titles[1 + (i % 25)],
      'Seeded item ' || i::text || ' for local development.',
      cats[1 + (i % 6)]::public.donation_category,
      1 + (i % 5),
      (array['like_new','good','usable'])[1 + (i % 3)]::public.donation_condition,
      (case cats[1 + (i % 6)]
        when 'clothes' then '{"washed":true,"undamaged":true,"complete_pairs":true,"would_wear":true}'
        when 'books' then '{"complete":true,"dry":true,"binding":true}'
        when 'toys' then '{"all_pieces":true,"clean":true,"safe":true,"battery":true}'
        when 'education' then '{"unused_pages":true,"complete_set":true,"working":true,"current":true}'
        when 'furniture' then '{"structurally_sound":true,"no_pests":true,"complete_fittings":true,"ready_to_move":true}'
        else '{"clean":true,"working":true,"complete":true,"safe":true}'
      end)::jsonb,
      'House ' || i::text || ', Coimbatore',
      ngo_pins[1 + (i % 5)],
      ngo_lat[1 + (i % 5)] + 0.004,
      ngo_lng[1 + (i % 5)] + 0.004,
      v_status,
      v_ngo,
      case when v_ngo is null then null else now() - ((30 - i) || ' hours')::interval end,
      case when v_ngo is null then null else now() + '48 hours'::interval end,
      case when v_status in ('scheduled','in_transit','received','acknowledged')
           then (array['courier','volunteer'])[1 + (i % 2)]::public.delivery_method
           else null end,
      case when v_status = 'rejected'
           then 'Items arrived damp and could not be given out.' else null end,
      now() - ((30 - i) || ' hours')::interval
    )
    returning id into v_donation;

    -- One to three photos each, so the masonry wall has varied tile heights.
    n_photos := 1 + (i % 3);
    for j in 0..(n_photos - 1) loop
      insert into public.donation_photos (donation_id, storage_path, sort_order)
      values (v_donation, 'seed/' || ((i + j) % 12)::text || '.png', j);
    end loop;

    -- Items in flight need a pickup row; the two OTP gates are issued when the
    -- volunteer accepts, not here.
    if v_status in ('scheduled', 'in_transit') then
      insert into public.pickups (donation_id, volunteer_id, slot_date, slot)
      values (
        v_donation, v_vol_ids[1 + (i % 3)], current_date + 1,
        (array['morning','evening'])[1 + (i % 2)]::public.pickup_slot
      );
    end if;

    -- The loop back: acknowledged items carry the NGO's photo and note.
    if v_status = 'acknowledged' then
      insert into public.acknowledgements (donation_id, ngo_id, photo_path, note)
      values (
        v_donation, v_ngo, 'seed/' || (i % 12)::text || '.png',
        'Received and handed out the same week. Thank you.'
      );
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- Verification documents, so the admin queue has something to review.
  -- NGO 1 is verified with reviewed papers; NGOs 4 and 5 get a pending set.
  -- -------------------------------------------------------------------------
  insert into public.ngo_documents (ngo_id, doc_type, storage_path, reviewed)
  select v_ngo_ids[1], d, 'seed/doc-' || d || '.pdf', true
  from unnest(array['registration_certificate', '80g_certificate', 'darpan_listing']) d;

  insert into public.ngo_documents (ngo_id, doc_type, storage_path, reviewed)
  select v_ngo_ids[4], d, 'seed/doc-' || d || '.pdf', false
  from unnest(array['registration_certificate', 'pan_card']) d;

  insert into public.ngo_documents (ngo_id, doc_type, storage_path, reviewed)
  select v_ngo_ids[5], d, 'seed/doc-' || d || '.pdf', false
  from unnest(array['registration_certificate', '80g_certificate']) d;

  -- Two NGOs waiting on verification, so the queue is not empty on reset.
  for i in 6..7 loop
    insert into public.users (phone, password_hash)
    values ('910000000' || i::text, pw)
    returning id into v_user;

    insert into public.profiles (user_id, full_name, phone, role, pincode, lat, lng)
    values (v_user, 'Kovai Karunai Illam ' || (i - 5)::text, '910000000' || i::text, 'ngo',
            '641014', 10.9903, 76.9905)
    returning id into v_profile;

    insert into public.ngos (
      profile_id, name, registration_number, address, pincode, lat, lng,
      verification_status, monthly_capacity, accepts_categories, contact_person, contact_phone
    )
    values (
      v_profile, 'Kovai Karunai Illam ' || (i - 5)::text, 'TN/2024/' || (2000 + i)::text,
      'Ramanathapuram, Coimbatore', '641014', 10.9903, 76.9905,
      'pending', 30, '{clothes,books}'::public.donation_category[],
      'Kovai Karunai Illam ' || (i - 5)::text, '910000000' || i::text
    )
    returning id into v_ngo;

    insert into public.ngo_documents (ngo_id, doc_type, storage_path, reviewed)
    values (v_ngo, 'registration_certificate', 'seed/doc-registration_certificate.pdf', false);
  end loop;

  -- -------------------------------------------------------------------------
  -- Shipments for the courier half of the in-transit items.
  -- -------------------------------------------------------------------------
  insert into public.shipments (donation_id, provider, awb_number, fee_paise, paid_by, status)
  select d.id, 'mock', 'MOCK' || lpad((row_number() over (order by d.created_at))::text, 10, '0'),
         9900, 'donor', 'in_transit'
  from public.donations d
  where d.delivery_method = 'courier' and d.status in ('in_transit', 'received', 'acknowledged');

  -- -------------------------------------------------------------------------
  -- Notification history: some delivered, one failed, one still queued — so the
  -- dispatcher's retry and dead-letter states are visible without waiting.
  -- -------------------------------------------------------------------------
  insert into public.notifications (profile_id, channel, template_key, payload, sent_at, error, attempts)
  select d.donor_id, 'sms', 'donation_claimed',
         jsonb_build_object('donation_id', d.id, 'title', d.title),
         now() - interval '2 hours', null, 1
  from public.donations d where d.status = 'claimed';

  insert into public.notifications (profile_id, channel, template_key, payload, sent_at, error, attempts)
  select d.donor_id, 'whatsapp', 'item_received',
         jsonb_build_object('donation_id', d.id),
         now() - interval '1 hour', null, 1
  from public.donations d where d.status = 'received';

  insert into public.notifications (profile_id, channel, template_key, payload, sent_at, error, attempts)
  select d.donor_id, 'sms', 'pickup_scheduled',
         jsonb_build_object('donation_id', d.id),
         null, 'provider timeout', 3
  from public.donations d where d.status = 'scheduled' limit 1;

  -- -------------------------------------------------------------------------
  -- Queues an admin is meant to clear.
  --
  -- Neither of these was seeded, so both panels in the People tab rendered as
  -- nothing on a fresh database and an operator had no way to know they exist.
  -- A queue you have never seen is a queue you do not check.
  -- -------------------------------------------------------------------------

  -- A donor who has since registered a trust. Whether this one can actually be
  -- granted depends on what they have in flight — which is the point: the
  -- refusal an operator meets here is the real guard, not a demo.
  insert into public.role_change_requests (profile_id, requested_role, reason, created_at)
  select p.id, 'ngo', 'We registered as a trust last month and want to receive instead of give.',
         now() - interval '2 days'
  from public.profiles p
  where p.role = 'donor'
  order by p.created_at
  limit 1;

  -- Someone who signed up to collect and meant to give. Chosen from the
  -- volunteers with nothing in hand, so this one grants cleanly and the
  -- request-clears-itself behaviour is visible without setting anything up.
  insert into public.role_change_requests (profile_id, requested_role, reason, created_at)
  select p.id, 'donor', null, now() - interval '5 hours'
  from public.profiles p
  join public.volunteers v on v.profile_id = p.id
  where p.role = 'volunteer'
    and not exists (
      select 1 from public.pickups pk
      where pk.volunteer_id = v.id and pk.delivered_at is null
    )
  order by p.created_at
  limit 1;

  -- One already dealt with, so the table is not only ever open rows.
  insert into public.role_change_requests
    (profile_id, requested_role, reason, created_at, handled_at, handled_by)
  select p.id, 'volunteer', 'Changed my mind.', now() - interval '9 days',
         now() - interval '8 days', (select id from public.profiles where role = 'admin' limit 1)
  from public.profiles p
  where p.role = 'donor'
  order by p.created_at desc
  limit 1;

  -- And one person locked out, for the queue directly beneath it. Explicitly
  -- somebody who is not already in the queue above: the seeded donors share a
  -- created_at, so ordering by it and taking an offset is not stable and put the
  -- same name in both panels.
  insert into public.password_reset_requests (phone, note, created_at)
  select p.phone, 'New phone, cannot remember the password.', now() - interval '6 hours'
  from public.profiles p
  where p.role = 'donor'
    and p.phone is not null
    and not exists (select 1 from public.role_change_requests r where r.profile_id = p.id)
  order by p.phone
  limit 1;

  -- -------------------------------------------------------------------------
  -- The health-donation lane (migration 024).
  --
  -- Seeded for the same reason the admin queues are: a screen nobody has ever
  -- seen is a screen nobody checks, and this whole lane renders as nothing
  -- until an institution exists and a donor has consented.
  -- -------------------------------------------------------------------------

  update public.ngos
  set health_categories = '{blood,breast_milk}'::public.health_category[],
      visit_instructions = 'Reception, Block B. Bring photo ID and eat something first.'
  where id = (
    select id from public.ngos where verification_status = 'verified' order by created_at limit 1
  );

  -- Two donors who have consented and offer blood, and one who offers hair —
  -- so the category filter is visibly doing something rather than matching
  -- everybody.
  insert into public.donor_health_profiles
    (profile_id, categories, blood_group, consented_at, consent_version)
  select p.id, '{blood}'::public.health_category[], 'O+'::public.blood_group, now(), 1
  from public.profiles p where p.role = 'donor' order by p.created_at limit 2;

  insert into public.donor_health_profiles
    (profile_id, categories, consented_at, consent_version)
  select p.id, '{hair}'::public.health_category[], now(), 1
  from public.profiles p where p.role = 'donor' order by p.created_at offset 2 limit 1;

  -- One open request, so the donor wall and the institution's list both have
  -- something in them.
  insert into public.health_requests
    (ngo_id, institution_name, category, blood_group, urgency, donors_needed, radius_km,
     lat, lng, address, pincode, note, expires_at)
  select n.id, n.name, 'blood', 'O+', 'urgent', 3, 10,
         n.lat, n.lng, n.address, n.pincode,
         'Two units short for a scheduled surgery tomorrow morning.',
         now() + interval '3 days'
  from public.ngos n where n.health_categories <> '{}' limit 1;

  raise notice 'seeded: 2 admins, 7 NGOs (5 verified, 2 pending), 4 volunteers, 6 donors, 30 donations, 3 waiting on an admin';
end
$seed$;
