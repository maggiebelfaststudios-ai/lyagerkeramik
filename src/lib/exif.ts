import exifr from "exifr";

export interface ParsedExif {
  captured_at: string | null;
  shutter_speed: string | null;
  aperture: string | null;
  focal_length: string | null;
  iso: number | null;
  camera: string | null;
  lens: string | null;
  width: number | null;
  height: number | null;
}

function formatShutter(exposureTime: unknown): string | null {
  if (typeof exposureTime !== "number" || !isFinite(exposureTime)) return null;
  if (exposureTime >= 1) {
    // Whole-second exposures: 2" , 1.5"
    return `${Number(exposureTime.toFixed(1))}"`;
  }
  return `1/${Math.round(1 / exposureTime)}`;
}

function formatAperture(fNumber: unknown): string | null {
  if (typeof fNumber !== "number" || !isFinite(fNumber)) return null;
  return `f/${Number(fNumber.toFixed(1))}`;
}

function formatFocal(focal: unknown): string | null {
  if (typeof focal !== "number" || !isFinite(focal)) return null;
  return `${Math.round(focal)}mm`;
}

function toIso(value: unknown): number | null {
  if (typeof value === "number") return Math.round(value);
  if (Array.isArray(value) && typeof value[0] === "number")
    return Math.round(value[0]);
  return null;
}

function joinCamera(make: unknown, model: unknown): string | null {
  const m = typeof make === "string" ? make.trim() : "";
  const mod = typeof model === "string" ? model.trim() : "";
  if (!m && !mod) return null;
  // Avoid "NIKON NIKON Z6" style duplication.
  if (mod && m && mod.toUpperCase().startsWith(m.toUpperCase())) return mod;
  return [m, mod].filter(Boolean).join(" ") || null;
}

// Parse EXIF from an image source. Isomorphic — exifr accepts File/Blob/
// ArrayBuffer/Uint8Array in the browser and Buffer on the server. Never throws.
export async function parseExif(
  source: Blob | ArrayBuffer | Uint8Array,
): Promise<ParsedExif> {
  const empty: ParsedExif = {
    captured_at: null,
    shutter_speed: null,
    aperture: null,
    focal_length: null,
    iso: null,
    camera: null,
    lens: null,
    width: null,
    height: null,
  };

  try {
    const tags = await exifr.parse(source, {
      // `pick` auto-enables whichever EXIF/IFD blocks hold these tags.
      pick: [
        "DateTimeOriginal",
        "CreateDate",
        "ExposureTime",
        "FNumber",
        "FocalLength",
        "ISO",
        "ISOSpeedRatings",
        "Make",
        "Model",
        "LensModel",
        "ExifImageWidth",
        "ExifImageHeight",
        "ImageWidth",
        "ImageHeight",
      ],
    });

    if (!tags) return empty;

    const captured: Date | undefined = tags.DateTimeOriginal ?? tags.CreateDate;

    return {
      captured_at:
        captured instanceof Date && !isNaN(captured.getTime())
          ? captured.toISOString()
          : null,
      shutter_speed: formatShutter(tags.ExposureTime),
      aperture: formatAperture(tags.FNumber),
      focal_length: formatFocal(tags.FocalLength),
      iso: toIso(tags.ISO ?? tags.ISOSpeedRatings),
      camera: joinCamera(tags.Make, tags.Model),
      lens: typeof tags.LensModel === "string" ? tags.LensModel.trim() : null,
      width: tags.ExifImageWidth ?? tags.ImageWidth ?? null,
      height: tags.ExifImageHeight ?? tags.ImageHeight ?? null,
    };
  } catch {
    return empty;
  }
}
