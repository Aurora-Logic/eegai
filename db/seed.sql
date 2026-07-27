-- Seed data for local development. Applied by `npm run db:reset`.
--
-- PLAN.md §10: 2 admins, 5 verified NGOs across Nashik pincodes, 4 volunteers,
-- and 30 donations spread across every state, so every feature is demoable from
-- a fresh reset with no manual clicking.
--
-- Every seeded account signs in with the password:  password123
-- The hash below is scrypt (N=2^17, r=8, p=1) as produced by
-- server/src/lib/password.ts. Regenerate it there if those parameters change.

do $seed$
declare
  pw constant text :=
    'scrypt$131072$8$1$qovVAwh3gWP/dXZk8auPjA==$CjXAgwuGJGwiZez1RCopVZ0VEXaU+9WoVXrIEptXz4hB0CM67k+ooaq4iLXOTex7ykBA7I/YvNuPHOR4YV0YlA==';

  -- Nashik, spread across real pincodes and roughly real coordinates.
  ngo_names constant text[] := array[
    'Sahyadri Seva Sangh', 'Godavari Bal Vikas', 'Panchavati Anna Kshetra',
    'Nashik Vidya Prasarak', 'Deolali Aadhar Trust'
  ];
  ngo_pins constant text[] := array['422001', '422002', '422003', '422009', '422005'];
  ngo_lat constant double precision[] := array[19.9975, 20.0110, 20.0080, 19.9600, 19.9450];
  ngo_lng constant double precision[] := array[73.7898, 73.7800, 73.7750, 73.7400, 73.8350];
  ngo_cats constant text[] := array[
    'clothes,books,toys', 'clothes,toys', 'clothes', 'books', 'books,toys'
  ];

  donor_names constant text[] := array[
    'Asha Kulkarni', 'Rohit Deshmukh', 'Meera Joshi',
    'Imran Shaikh', 'Sunita Pawar', 'Kartik Rane'
  ];
  vol_names constant text[] := array[
    'Nikhil Bhosale', 'Priya Wagh', 'Sameer Jadhav', 'Tanvi Gaikwad'
  ];

  titles constant text[] := array[
    'Winter jackets', 'School textbooks', 'Wooden puzzle set', 'Cotton sarees',
    'Story books for 8-10 year olds', 'Board games', 'Children''s sweaters',
    'Engineering reference books', 'Soft toys', 'Kurtas, barely worn',
    'Exam guides', 'Building blocks', 'Denim jeans', 'Marathi novels',
    'Toy cars'
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
    values (v_user, 'Admin ' || i::text, '900000000' || i::text, 'admin', '422001', 19.9975, 73.7898)
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
      v_profile, ngo_names[i], 'MH/2019/' || (1000 + i)::text, 'MH/2019/' || (5000 + i)::text,
      i % 2 = 1, ngo_names[i] || ', Nashik', ngo_pins[i], ngo_lat[i], ngo_lng[i],
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
    v_ngo := case
      when v_status in ('posted', 'cancelled') then null
      else v_ngo_ids[1 + (i % 5)]
    end;

    insert into public.donations (
      donor_id, title, description, category, quantity, condition,
      condition_checklist, pickup_address, pincode, lat, lng, status,
      claimed_by_ngo_id, claimed_at, claim_expires_at, delivery_method,
      rejected_reason, posted_at
    )
    values (
      v_donor_profiles[1 + (i % 6)],
      titles[1 + (i % 15)],
      'Seeded item ' || i::text || ' for local development.',
      (array['clothes','books','toys'])[1 + (i % 3)]::public.donation_category,
      1 + (i % 5),
      (array['like_new','good','usable'])[1 + (i % 3)]::public.donation_condition,
      '{"washed":true,"undamaged":true,"complete_pairs":true,"would_wear":true}'::jsonb,
      'House ' || i::text || ', Nashik',
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

  raise notice 'seeded: 2 admins, 5 NGOs, 4 volunteers, 6 donors, 30 donations';
end
$seed$;
