-- ============================================================================
-- Video support. Videos live in the photos table alongside photos:
--   media_type   'image' (every existing row) or 'video'
--   poster_path  a video's still frame in the Photos bucket
--   duration     seconds
--   has_audio    true when the soundtrack isn't silence
-- Run this in the Supabase SQL editor before uploading a video.
-- ============================================================================

alter table public.photos
  add column if not exists media_type text    not null default 'image',
  add column if not exists poster_path text,
  add column if not exists duration    real,
  add column if not exists has_audio   boolean not null default false;

alter table public.photos drop constraint if exists photos_media_type_check;
alter table public.photos
  add constraint photos_media_type_check check (media_type in ('image', 'video'));
