-- ============================================================================
-- Separate ordering for the mobile main-page feed. NULL falls back to
-- main_page_order. Run this in the Supabase SQL editor.
-- ============================================================================

alter table public.photos
  add column if not exists mobile_order int;
