// Mobile main-page crop. One locked, phone-shaped portrait aspect; per photo we
// store a crop rectangle (move + resize). Rendering is pure CSS — no re-export.

// Display aspect of the mobile frame (width : height). Tall, ~a phone screen.
export const MOBILE_W = 9;
export const MOBILE_H = 19.5;
export const MOBILE_RATIO = MOBILE_W / MOBILE_H; // ≈ 0.4615

// A crop rectangle in PERCENT (0–100) of the original image.
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Largest MOBILE_RATIO rectangle centered in an image of the given dimensions.
export function defaultCrop(imgW: number, imgH: number): Crop {
  const ar = imgW / imgH;
  // Crop pixel aspect must equal MOBILE_RATIO: (w*imgW)/(h*imgH) = ratio.
  // Try full width first; if the needed height overflows, pin height instead.
  const hIfFullWidth = ar / MOBILE_RATIO; // h fraction when w = 1
  let w: number;
  let h: number;
  if (hIfFullWidth <= 1) {
    w = 100;
    h = hIfFullWidth * 100;
  } else {
    h = 100;
    w = (MOBILE_RATIO / ar) * 100;
  }
  return { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
}

// Resolve a photo's stored crop, or fall back to the centered default.
export function resolveCrop(
  c:
    | { x: number | null; y: number | null; w: number | null; h: number | null }
    | null
    | undefined,
  imgW: number,
  imgH: number,
): Crop {
  if (c && c.w != null && c.h != null && c.x != null && c.y != null) {
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  }
  return defaultCrop(imgW, imgH);
}

// CSS custom properties that position the image so the crop fills a
// MOBILE_RATIO container (see .mobile-crop in globals.css).
export function cropVars(c: Crop): Record<string, string> {
  const cwf = c.w / 100;
  const chf = c.h / 100;
  return {
    "--cw": `${100 / cwf}%`,
    "--ch": `${100 / chf}%`,
    "--cl": `${-(c.x / 100 / cwf) * 100}%`,
    "--ct": `${-(c.y / 100 / chf) * 100}%`,
  };
}

// `object-position` that keeps a stored crop in view when the item is shown
// with object-fit: cover (the Info page background). Exact on phones, where the
// screen has roughly the crop's shape. Elsewhere it follows the same framing.
export function cropObjectPosition(c: Crop): string {
  const axis = (offset: number, size: number) =>
    size >= 100 ? 50 : Math.min(100, Math.max(0, (offset / (100 - size)) * 100));
  return `${axis(c.x, c.w)}% ${axis(c.y, c.h)}%`;
}

// Responsive `sizes` so a zoomed-in crop still pulls a sharp source on mobile.
export function cropSizes(c: Crop): string {
  const mobileVw = Math.min(320, Math.round(100 / (c.w / 100)));
  return `(max-width: 768px) ${mobileVw}vw, 100vw`;
}
