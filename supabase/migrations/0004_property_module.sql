-- ============================================================
-- 0004_property_module  (Phase 4 — landlord property management)
-- ============================================================
-- Verified against the live DB before writing:
--   property_types, room_types, amenity_categories, amenities  = 0 rows
--   properties, rooms, beds, rental_rates                      = 0 rows,
--     BIGINT primary keys with NO default
--
-- This migration:
--   1. adds sequence-backed DEFAULTs to the operational PKs the app creates
--   2. adds a sequence-backed DEFAULT to amenities.amenity_id
--   3. seeds the reference catalogs the property/room forms need
--
-- No tables, columns, or constraints from the baseline (spec §31) are changed.
-- Sequences start at 1,000,000 (above every legacy id in the source dump).
-- After a legacy import, bump each with setval() to its max.
-- ============================================================

begin;

-- ---- 1. operational id sequences -------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('properties',    'property_id'),
      ('rooms',         'room_id'),
      ('beds',          'bed_id'),
      ('rental_rates',  'rate_id'),
      ('amenities',     'amenity_id')
    ) as v(tbl, col)
  loop
    execute format(
      'create sequence if not exists public.%I as bigint start with 1000000 '
      || 'minvalue 1000000 increment by 1 owned by public.%I.%I',
      t.tbl || '_' || t.col || '_seq', t.tbl, t.col
    );
    execute format(
      'alter table public.%I alter column %I set default '
      || 'nextval(''public.%I'')',
      t.tbl, t.col, t.tbl || '_' || t.col || '_seq'
    );
  end loop;
end $$;

-- ---- 2. property types ----------------------------------------------------

insert into public.property_types (type_name, description)
select v.type_name, v.description
from (values
  ('Apartment',      'Self-contained residential unit in a building'),
  ('Condominium',    'Privately owned unit in a shared building'),
  ('House',          'Standalone residential house'),
  ('Townhouse',      'Multi-floor house sharing walls with neighbours'),
  ('Studio',         'Single open-plan room with kitchenette'),
  ('Dormitory',      'Shared rooms with multiple beds'),
  ('Boarding House',  'Rooms for rent, often with shared facilities'),
  ('Bed Space',      'Individual bed within a shared room')
) as v(type_name, description)
where not exists (select 1 from public.property_types);

-- ---- 3. room types -----------------------------------------------------

insert into public.room_types (room_type_name, description, max_occupants)
select v.name, v.description, v.max_occupants
from (values
  ('Single',  'One occupant',            1),
  ('Double',  'Two occupants',           2),
  ('Triple',  'Three occupants',         3),
  ('Quad',    'Four occupants',          4),
  ('Family',  'Family room',             6),
  ('Shared',  'Shared / bed-space room', 8),
  ('Studio',  'Studio-style room',       2)
) as v(name, description, max_occupants)
where not exists (select 1 from public.room_types);

-- ---- 4. amenity categories + amenities ------------------------------------

insert into public.amenity_categories (category_name)
select v.name
from (values
  ('Connectivity'),
  ('Comfort'),
  ('Utilities'),
  ('Kitchen'),
  ('Bathroom'),
  ('Security'),
  ('Building'),
  ('Policies')
) as v(name)
where not exists (select 1 from public.amenity_categories);

insert into public.amenities (amenity_category_id, amenity_name, description)
select
  (select amenity_category_id from public.amenity_categories
   where category_name = v.category),
  v.name,
  v.description
from (values
  ('Connectivity', 'Wi-Fi',              'Wireless internet access'),
  ('Connectivity', 'Wired Internet',     'LAN internet connection'),
  ('Comfort',      'Air Conditioning',   'Air-conditioned room'),
  ('Comfort',      'Electric Fan',       'Ceiling or stand fan provided'),
  ('Comfort',      'Bed & Mattress',     'Bed frame and mattress provided'),
  ('Comfort',      'Study Desk',         'Desk and chair provided'),
  ('Comfort',      'Wardrobe',           'Closet or cabinet for clothes'),
  ('Utilities',    'Water Included',     'Water bill covered by rent'),
  ('Utilities',    'Electricity Included','Electricity bill covered by rent'),
  ('Utilities',    'Laundry Area',       'Access to a laundry / washing area'),
  ('Kitchen',      'Shared Kitchen',     'Access to a shared kitchen'),
  ('Kitchen',      'Private Kitchen',    'Private kitchen in the unit'),
  ('Kitchen',      'Refrigerator',       'Refrigerator available'),
  ('Bathroom',     'Private Bathroom',   'Bathroom exclusive to the unit'),
  ('Bathroom',     'Shared Bathroom',    'Shared bathroom facilities'),
  ('Bathroom',     'Hot Shower',         'Hot / warm water shower'),
  ('Security',     'CCTV',               'CCTV surveillance on premises'),
  ('Security',     'Security Guard',     'On-site security personnel'),
  ('Security',     'Gated Entry',        'Gated or keycard entry'),
  ('Building',     'Elevator',           'Building has an elevator'),
  ('Building',     'Parking',            'Parking space available'),
  ('Building',     'Near Public Transit','Close to jeepney / bus / train'),
  ('Policies',     'Pet Friendly',       'Pets are allowed'),
  ('Policies',     'Curfew',             'Property enforces a curfew')
) as v(category, name, description)
where not exists (select 1 from public.amenities);

commit;

-- Verify:
--   select count(*) from public.property_types;   -- 8
--   select count(*) from public.room_types;       -- 7
--   select count(*) from public.amenities;        -- 24
--   select column_default from information_schema.columns
--    where table_schema='public' and table_name='properties'
--      and column_name='property_id';             -- nextval(...)
