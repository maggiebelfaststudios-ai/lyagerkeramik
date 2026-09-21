-- ============================================================================
-- Per-photo mobile visibility. When false, the photo is shown on desktop but
-- excluded from the mobile main-page feed. Defaults to true so existing photos
-- stay visible. Run this in the Supabase SQL editor.
-- ============================================================================

alter table public.photos
  add column if not exists on_mobile boolean not null default true;
