-- ============================================================================
-- Make the mobile feed independent from the desktop main page.
-- on_mobile now means "in the mobile feed" (membership), no longer "show on
-- mobile if also on desktop". Seed it from the current desktop set so the
-- existing mobile feed is preserved, then default new photos to not-in-feed.
-- Run this in the Supabase SQL editor.
-- ============================================================================

update public.photos set on_mobile = on_main_page;

alter table public.photos alter column on_mobile set default false;
