// What the admin uploader accepts. Shared by the browser (to refuse early, with
// a reason) and the import route (to re-check on the server).

// Supabase Free caps every stored file at 50 MB. Originals go to Storage before
// the server can touch them, so this is the ceiling for anything uploaded.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type MediaKind = "image" | "video";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif", "tif", "tiff"]);
const VIDEO_EXT = new Set(["mp4", "mov", "m4v"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-m4v"]);

// `accept` for the file picker.
export const ACCEPT = "image/*,video/mp4,video/quicktime,.mp4,.mov,.m4v";

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function classify(file: {
  name: string;
  type: string;
  size: number;
}): { kind: MediaKind } | { error: string } {
  const ext = extensionOf(file.name);
  const type = file.type.toLowerCase();

  // The server cannot decode HEIC, and most browsers cannot show it either.
  if (ext === "heic" || ext === "heif" || type === "image/heic" || type === "image/heif") {
    return { error: "HEIC can't be shown on the web. Export it as JPEG and upload that." };
  }

  let kind: MediaKind;
  if (VIDEO_TYPES.has(type) || VIDEO_EXT.has(ext)) kind = "video";
  else if (type.startsWith("image/") || IMAGE_EXT.has(ext)) kind = "image";
  else return { error: "Not a photo or video this site can use." };

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(0);
    return {
      error:
        kind === "video"
          ? `Too large (${mb} MB). The limit is 50 MB, so export a shorter clip or at a lower bitrate.`
          : `Too large (${mb} MB). The limit is 50 MB per file.`,
    };
  }

  return { kind };
}
