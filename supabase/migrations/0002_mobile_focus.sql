-- ============================================================================
-- Mobile framing — per-photo crop rectangle for the locked tall mobile crop.
-- Values are percentages (0–100) of the original image; NULL = centered
-- default. The crop is applied at render time with CSS; the original file is
-- never modified. Idempotent: safe to run even if an earlier focal-point
-- version of this migration was applied.
-- Run this in the Supabase SQL editor.
-- ============================================================================

-- Remove the earlier focal-point columns if they exist.
alter table public.photos drop column if exists mobile_focus_x;
alter table public.photos drop column if exists mobile_focus_y;

-- Crop rectangle (move + resize). NULL until the photo is framed.
alter table public.photos
  add column if not exists mobile_crop_x real,
  add column if not exists mobile_crop_y real,
  add column if not exists mobile_crop_w real,
  add column if not exists mobile_crop_h real;
