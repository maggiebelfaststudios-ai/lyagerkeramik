-- ============================================================================
-- Photography portfolio — initial schema (clean reset)
-- Run in the Supabase SQL editor against the existing project.
--
-- This DROPS the old build's `photos` and `layouts` tables and recreates a
-- fresh schema. Image files in the `Photos` storage bucket are NOT touched —
-- only database rows are reset.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── reset old build ─────────────────────────────────────────────────────────
drop table if exists public.layouts cascade;
drop table if exists public.photos  cascade;
drop table if exists public.folders cascade;

-- ── folders ─────────────────────────────────────────────────────────────────
create table public.folders (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  description    text,
  cover_photo_id uuid,                       -- FK added after photos exists
  display_order  int  not null default 0,
  created_at     timestamptz not null default now()
);

-- ── photos ──────────────────────────────────────────────────────────────────
create table public.photos (
  id               uuid primary key default gen_random_uuid(),
  storage_path     text not null,            -- path inside the `Photos` bucket
  filename         text,
  width            int,
  height           int,
  blur_placeholder text,                     -- base64 data URL
  captured_at      timestamptz,              -- from EXIF, nullable
  uploaded_at      timestamptz not null default now(),
  shutter_speed    text,                     -- e.g. "1/250"
  aperture         text,                     -- e.g. "f/2.8"
  focal_length     text,                     -- e.g. "35mm"
  iso              int,
  camera           text,
  lens             text,
  description      text,
  folder_id        uuid references public.folders(id) on delete set null,
  on_main_page     boolean not null default false,  -- in the desktop feed?
  main_page_order  int,                      -- desktop feed order
  on_mobile        boolean not null default false,  -- in the mobile feed?
  mobile_order     int,                      -- mobile feed order
  -- Mobile crop rectangle, percent of the original image; NULL = centered default.
  mobile_crop_x    real,
  mobile_crop_y    real,
  mobile_crop_w    real,
  mobile_crop_h    real
);

-- folders.cover_photo_id → photos.id
alter table public.folders
  add constraint folders_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos(id) on delete set null;

-- ── indexes ─────────────────────────────────────────────────────────────────
create index photos_folder_id_idx     on public.photos (folder_id);
create index photos_main_page_idx     on public.photos (on_main_page, main_page_order);
create index folders_display_order_idx on public.folders (display_order);

-- ============================================================================
-- Row Level Security
--   Public (anon) may read both tables. Only authenticated users may write.
-- ============================================================================
alter table public.folders enable row level security;
alter table public.photos  enable row level security;

create policy "folders public read"
  on public.folders for select
  using (true);

create policy "folders authenticated write"
  on public.folders for all
  to authenticated
  using (true)
  with check (true);

create policy "photos public read"
  on public.photos for select
  using (true);

create policy "photos authenticated write"
  on public.photos for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================================
-- Storage policies for the existing `Photos` bucket
--   Public read; authenticated insert / update / delete.
--   Also ensure the bucket is marked public:
--   Storage → Photos → Settings → "Public bucket".
-- ============================================================================
drop policy if exists "Photos public read"          on storage.objects;
drop policy if exists "Photos authenticated insert" on storage.objects;
drop policy if exists "Photos authenticated update" on storage.objects;
drop policy if exists "Photos authenticated delete" on storage.objects;

create policy "Photos public read"
  on storage.objects for select
  using (bucket_id = 'Photos');

create policy "Photos authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'Photos');

create policy "Photos authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'Photos')
  with check (bucket_id = 'Photos');

create policy "Photos authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'Photos');
