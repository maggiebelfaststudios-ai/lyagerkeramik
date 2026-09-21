"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/images";
import type { PhotoMetadata } from "@/lib/types";

// ── helpers ──────────────────────────────────────────────────────────────────
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return supabase;
}

// Revalidate the public surfaces after a mutation.
function revalidatePublic() {
  revalidatePath("/", "layout");
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "folder"
  );
}

// ── photos ───────────────────────────────────────────────────────────────────
// New photos and videos are added by the import route (app/admin/import).

export async function deletePhoto(id: string) {
  const supabase = await requireUser();

  // `*` rather than named columns, so this works before migration 0006 too.
  const { data: photo } = await supabase
    .from("photos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const files = [photo?.storage_path, photo?.poster_path].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );
  if (files.length) {
    await supabase.storage.from(BUCKET).remove(files);
  }

  const { error } = await supabase.from("photos").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePublic();
}

export async function updatePhotoMeta(id: string, meta: PhotoMetadata) {
  const supabase = await requireUser();
  const { error } = await supabase
    .from("photos")
    .update({
      captured_at: meta.captured_at,
      shutter_speed: meta.shutter_speed,
      aperture: meta.aperture,
      focal_length: meta.focal_length,
      iso: meta.iso,
      camera: meta.camera,
      lens: meta.lens,
      description: meta.description,
      mobile_crop_x: meta.mobile_crop_x,
      mobile_crop_y: meta.mobile_crop_y,
      mobile_crop_w: meta.mobile_crop_w,
      mobile_crop_h: meta.mobile_crop_h,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePublic();
}

export async function assignPhotoFolder(
  photoId: string,
  folderId: string | null,
) {
  const supabase = await requireUser();
  const { error } = await supabase
    .from("photos")
    .update({ folder_id: folderId })
    .eq("id", photoId);
  if (error) throw new Error(error.message);
  revalidatePublic();
}

// ── main-page curation ─────────────────────────────────────────────────────--
export async function setOnMainPage(id: string, on: boolean) {
  const supabase = await requireUser();

  let order: number | null = null;
  if (on) {
    const { data } = await supabase
      .from("photos")
      .select("main_page_order")
      .eq("on_main_page", true)
      .order("main_page_order", { ascending: false, nullsFirst: false })
      .limit(1);
    const max = data?.[0]?.main_page_order ?? 0;
    order = max + 1;
  }

  const { error } = await supabase
    .from("photos")
    .update({ on_main_page: on, main_page_order: order })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePublic();
}

export async function setOnMobile(id: string, on: boolean) {
  const supabase = await requireUser();

  let order: number | null = null;
  if (on) {
    const { data } = await supabase
      .from("photos")
      .select("mobile_order")
      .eq("on_mobile", true)
      .order("mobile_order", { ascending: false, nullsFirst: false })
      .limit(1);
    const max = data?.[0]?.mobile_order ?? 0;
    order = max + 1;
  }

  const { error } = await supabase
    .from("photos")
    .update({ on_mobile: on, mobile_order: order })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePublic();
}

export async function reorderMainPage(orderedIds: string[]) {
  const supabase = await requireUser();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("photos").update({ main_page_order: i }).eq("id", id),
    ),
  );
  revalidatePublic();
}

export async function reorderMobile(orderedIds: string[]) {
  const supabase = await requireUser();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("photos").update({ mobile_order: i }).eq("id", id),
    ),
  );
  revalidatePublic();
}

// ── folders ─────────────────────────────────────────────────────────────────
export async function createFolder(name: string) {
  const supabase = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name required");

  // Unique slug.
  const base = slugify(trimmed);
  const { data: existing } = await supabase.from("folders").select("slug");
  const taken = new Set((existing ?? []).map((f) => f.slug));
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;

  const { data: maxRow } = await supabase
    .from("folders")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1);
  const order = (maxRow?.[0]?.display_order ?? 0) + 1;

  const { error } = await supabase
    .from("folders")
    .insert({ name: trimmed, slug, display_order: order });
  if (error) throw new Error(error.message);
  revalidatePublic();
}

export async function updateFolder(
  id: string,
  fields: { name?: string; description?: string | null; cover_photo_id?: string | null },
) {
  const supabase = await requireUser();
  const { error } = await supabase.from("folders").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePublic();
}

export async function deleteFolder(id: string) {
  const supabase = await requireUser();
  // photos.folder_id and folders.cover_photo_id are ON DELETE SET NULL.
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePublic();
}

export async function reorderFolders(orderedIds: string[]) {
  const supabase = await requireUser();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("folders").update({ display_order: i }).eq("id", id),
    ),
  );
  revalidatePublic();
}
