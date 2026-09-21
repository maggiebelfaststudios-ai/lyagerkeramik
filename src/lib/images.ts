// Helpers for turning a stored path into a public URL.

export const BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "Photos";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Public object URL for a file in the Photos bucket. Next/Image handles the
// actual resizing/optimization (see next.config.ts remotePatterns).
export function publicUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURI(
    storagePath,
  )}`;
}

// The still image for an item: the photo itself, or a video's poster frame.
export function stillPath(item: {
  storage_path: string;
  media_type?: string | null;
  poster_path?: string | null;
}): string {
  return item.media_type === "video" && item.poster_path
    ? item.poster_path
    : item.storage_path;
}
