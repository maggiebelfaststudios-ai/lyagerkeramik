-- ============================================================================
-- One-paste setup for a brand-new Supabase project: migration 0001 (tables,
-- access rules, storage rules) + the Photos bucket + 0006 (video). Migrations
-- 0002-0005 are already contained in 0001. Run once in the SQL editor.
-- ============================================================================

-- ── storage bucket (public: the site reads files straight from it) ─────────
insert into storage.buckets (id, name, public)
values ('Photos', 'Photos', true)
on conflict (id) do update set public = true;

-- ── 0001: tables ───────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

create table public.folders (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  description    text,
  cover_photo_id uuid,
  display_order  int  not null default 0,
  created_at     timestamptz not null default now()
);

create table public.photos (
  id               uuid primary key default gen_random_uuid(),
  storage_path     text not null,
  filename         text,
  width            int,
  height           int,
  blur_placeholder text,
  captured_at      timestamptz,
  uploaded_at      timestamptz not null default now(),
  shutter_speed    text,
  aperture         text,
  focal_length     text,
  iso              int,
  camera           text,
  lens             text,
  description      text,
  folder_id        uuid references public.folders(id) on delete set null,
  on_main_page     boolean not null default false,
  main_page_order  int,
  on_mobile        boolean not null default false,
  mobile_order     int,
  mobile_crop_x    real,
  mobile_crop_y    real,
  mobile_crop_w    real,
  mobile_crop_h    real
);

alter table public.folders
  add constraint folders_cover_photo_id_fkey
  foreign key (cover_photo_id) references public.photos(id) on delete set null;

create index photos_folder_id_idx      on public.photos (folder_id);
create index photos_main_page_idx      on public.photos (on_main_page, main_page_order);
create index folders_display_order_idx on public.folders (display_order);

-- ── 0001: access rules (public read, signed-in write) ──────────────────────
alter table public.folders enable row level security;
alter table public.photos  enable row level security;

create policy "folders public read" on public.folders for select using (true);
create policy "folders authenticated write" on public.folders for all
  to authenticated using (true) with check (true);

create policy "photos public read" on public.photos for select using (true);
create policy "photos authenticated write" on public.photos for all
  to authenticated using (true) with check (true);

create policy "Photos public read" on storage.objects for select
  using (bucket_id = 'Photos');
create policy "Photos authenticated insert" on storage.objects for insert
  to authenticated with check (bucket_id = 'Photos');
create policy "Photos authenticated update" on storage.objects for update
  to authenticated using (bucket_id = 'Photos') with check (bucket_id = 'Photos');
create policy "Photos authenticated delete" on storage.objects for delete
  to authenticated using (bucket_id = 'Photos');

-- ── 0006: video ────────────────────────────────────────────────────────────
alter table public.photos
  add column media_type  text    not null default 'image',
  add column poster_path text,
  add column duration    real,
  add column has_audio   boolean not null default false;

alter table public.photos
  add constraint photos_media_type_check check (media_type in ('image', 'video'));

-- ── 0007: site settings (Info page background) ─────────────────────────────
create table public.site_settings (
  id                 int primary key default 1 check (id = 1),
  info_background_id uuid references public.photos(id) on delete set null
);
insert into public.site_settings (id) values (1);
alter table public.site_settings enable row level security;
create policy "site_settings public read" on public.site_settings for select
  using (true);
create policy "site_settings authenticated write" on public.site_settings for all
  to authenticated using (true) with check (true);
