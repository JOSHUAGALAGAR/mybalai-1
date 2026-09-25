-- ============================================================
-- 0013_property_images  (Property & room photo galleries)
-- ============================================================
-- Verified against the live DB before writing:
--   property_images = 0 rows. Columns: property_image_id (BIGINT PK, identity),
--     property_id, storage_path, original_filename, mime_type, file_size,
--     is_cover (default false), sort_order (default 0), created_at
--   room_images     = exists: room_image_id (BIGINT PK, identity), room_id,
--     storage_path, original_filename, created_at, sort_order
--     -> missing is_cover / mime_type / file_size
--
-- This migration (no baseline table is dropped or recreated):
--   1. makes sure both image PKs generate ids (identity or sequence DEFAULT; left alone if
--      they already do)
--   2. adds is_cover / mime_type / file_size to room_images
--   3. allows at most ONE cover per property / per room
--   4. makes sure RLS is on (no policy — only the service layer touches these)
--   5. creates the public `property-images` Storage bucket (5 MB, JPG/PNG/WebP)
--
-- Landlords upload several photos per property and per room and choose a cover.
-- The cover's public URL is also copied into `properties.property_image` /
-- `rooms.room_image` by the app, so search results, the mobile app and every
-- existing screen keep working unchanged. Public URLs are derived from
-- `storage_path`, so no URL is stored.
--
-- Uploads go browser -> Storage through short-lived signed upload URLs that the
-- server only issues after checking the caller manages that property, so NO
-- Storage INSERT policy is needed (and nobody else can write to the bucket).
-- Reads are public (property photos are public), so no SELECT policy either.
--
-- Idempotent — safe to re-run. Apply in the Supabase SQL editor.
-- ============================================================

begin;

-- ---- 1. id generation --------------------------------------------------------
-- Some of these ids are already IDENTITY columns (they look default-less in
-- information_schema, and `SET DEFAULT` on them errors). Only a column that has
-- neither an identity nor a default gets a sequence (same pattern as 0004).
do $$
declare
  t record;
  v_identity boolean;
  v_default boolean;
begin
  for t in
    select * from (values
      ('property_images', 'property_image_id'),
      ('room_images',     'room_image_id')
    ) as v(tbl, col)
  loop
    select c.is_identity = 'YES', c.column_default is not null
      into v_identity, v_default
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name = t.col;

    if v_identity or v_default then
      continue;
    end if;

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

-- ---- 2. room_images: the columns property_images already has -------------------
alter table public.room_images add column if not exists is_cover  boolean not null default false;
alter table public.room_images add column if not exists mime_type  text;
alter table public.room_images add column if not exists file_size  bigint;

-- ---- 3. one cover per property / room; fast gallery listing ----------------------
create unique index if not exists property_images_one_cover
  on public.property_images (property_id) where is_cover;
create unique index if not exists room_images_one_cover
  on public.room_images (room_id) where is_cover;

create index if not exists property_images_property_idx
  on public.property_images (property_id, sort_order, property_image_id);
create index if not exists room_images_room_idx
  on public.room_images (room_id, sort_order, room_image_id);

-- a file is claimed by exactly one row
create unique index if not exists property_images_path_key
  on public.property_images (storage_path);
create unique index if not exists room_images_path_key
  on public.room_images (storage_path);

-- ---- 4. RLS on, no policy ------------------------------------------------------
alter table public.property_images enable row level security;
alter table public.room_images     enable row level security;

-- ---- 5. Storage bucket -----------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images', 'property-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

commit;

-- Verify:
--   select id, public, file_size_limit from storage.buckets where id = 'property-images';
--   select column_default from information_schema.columns
--     where table_name in ('property_images','room_images') and column_name like '%_image_id';
--   select column_name from information_schema.columns
--     where table_name = 'room_images' order by ordinal_position;   -- includes is_cover
