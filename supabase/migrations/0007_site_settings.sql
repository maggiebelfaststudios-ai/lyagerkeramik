-- ============================================================================
-- Site-wide settings: a single row (id = 1). For now it holds the Info page
-- background, a photo or video from the library. Deleting that item clears it.
-- Run this in the Supabase SQL editor.
-- ============================================================================

create table if not exists public.site_settings (
  id                 int primary key default 1 check (id = 1),
  info_background_id uuid references public.photos(id) on delete set null
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "site_settings public read" on public.site_settings;
create policy "site_settings public read"
  on public.site_settings for select
  using (true);

drop policy if exists "site_settings authenticated write" on public.site_settings;
create policy "site_settings authenticated write"
  on public.site_settings for all
  to authenticated
  using (true)
  with check (true);
