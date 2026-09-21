// Server-side photo optimisation (sharp). Runs in the import route, after the
// original has been uploaded to Storage.
//
// Why on the server rather than a browser canvas: a canvas resamples bilinearly,
// and Firefox hands it pixels already converted to the monitor's colour profile,
// so a calibrated screen would bake a colour shift into the stored file. sharp
// is also what Next/Image uses to serve every photo, so the result is the same
// on any machine it is uploaded from.
//
// No imports besides sharp, so tools/test-media.mts can load this file directly.
import sharp from "sharp";

// The widest image the site ever serves: the largest `deviceSizes` entry in
// next.config.ts. Next/Image never sends a visitor more pixels than this, so
// anything wider is storage cost with no visible benefit. Width, not long edge,
// because the site picks sizes by width. A tall photo keeps its full height.
export const MAX_STORED_WIDTH = 3840;

// Every visitor gets Next's AVIF made from the stored file, so the stored file
// is an intermediate. Tested on the portfolio's grainiest photos:
// - q100 4:4:4 serves the same as the original (within 0.03 dB PSNR at 3840px);
// - q95 lost up to 2.7 dB on the grain.
// Nothing lower than q100 is used.
const JPEG = { quality: 100, mozjpeg: true, chromaSubsampling: "4:4:4" } as const;

// A re-encode that saves only a little isn't worth another generation of
// compression. Below this saving, the uploaded file is kept as is.
const MIN_SAVING = 0.1;

// Formats a browser and Next/Image display directly.
const WEB_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif"]);

export interface ImageResult {
  outcome: "optimised" | "original";
  data: Buffer; // the bytes to store
  ext: string;
  contentType: string;
  width: number; // as displayed, with EXIF orientation applied
  height: number;
  note: string;
}

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export async function optimiseImage(input: Buffer): Promise<ImageResult> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new Error("This file couldn't be read as an image. It may be damaged.");
  }

  // sharp reports both AVIF and HEIC as "heif". Only AVIF can be decoded here.
  const heic = meta.format === "heif" && meta.compression !== "av1";
  if (heic) {
    throw new Error("HEIC can't be shown on the web. Export it as JPEG and upload that.");
  }
  const format = meta.format === "heif" ? "avif" : meta.format;
  const web = WEB_FORMATS.has(format);
  const { width, height } = meta.autoOrient;

  const original = (note: string): ImageResult => ({
    outcome: "original",
    data: input,
    ext: format === "jpeg" ? "jpg" : format,
    contentType: `image/${format}`,
    width,
    height,
    note,
  });

  // Resizing would keep only the first frame of an animation.
  if (web && (meta.pages ?? 1) > 1) return original("animated, kept as uploaded");

  const resize = width > MAX_STORED_WIDTH;
  try {
    let pipeline = sharp(input)
      .autoOrient()
      .resize({ width: MAX_STORED_WIDTH, withoutEnlargement: true, kernel: "lanczos3" });

    // Transparency only survives as PNG (lossless). Everything else is JPEG.
    const transparent = meta.hasAlpha && !(await sharp(input).stats()).isOpaque;
    pipeline = transparent
      ? pipeline.png({ compressionLevel: 9, adaptiveFiltering: true })
      : pipeline.jpeg(JPEG);

    // sharp converts to sRGB and strips metadata (GPS included) by default.
    // Next/Image does the same when serving, so visitors see no difference.
    const out = await pipeline.toBuffer({ resolveWithObject: true });

    const worthIt = out.data.length <= input.length * (1 - MIN_SAVING);
    if (web && meta.space !== "cmyk" && !worthIt) {
      return original(
        resize
          ? "kept as uploaded (a resized copy wouldn't be much smaller)"
          : "kept as uploaded (already efficient)",
      );
    }

    const size = resize ? `${width}×${height} → ${out.info.width}×${out.info.height} · ` : "";
    return {
      outcome: "optimised",
      data: out.data,
      ext: transparent ? "png" : "jpg",
      contentType: transparent ? "image/png" : "image/jpeg",
      width: out.info.width,
      height: out.info.height,
      note: `${size}${mb(input.length)} → ${mb(out.data.length)}`,
    };
  } catch (err) {
    // Not "keep the original" as in Kolofon: Next/Image serves photos through
    // sharp too, so a file that fails here would show as broken on the site.
    throw new Error(
      `This image couldn't be processed (${err instanceof Error ? err.message : "unknown error"}). ` +
        "It may be damaged. Re-export it and try again.",
    );
  }
}

// Tiny base64 JPEG placeholder, matching what the uploader used to make in the
// browser.
export async function blurDataUrl(image: Buffer): Promise<string | null> {
  try {
    const tiny = await sharp(image).autoOrient().resize(24).jpeg({ quality: 50 }).toBuffer();
    return `data:image/jpeg;base64,${tiny.toString("base64")}`;
  } catch {
    return null;
  }
}
