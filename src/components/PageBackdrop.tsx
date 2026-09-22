import Image from "next/image";
import VideoPlayer from "@/components/VideoPlayer";
import { publicUrl } from "@/lib/images";
import { resolveCrop, cropObjectPosition } from "@/lib/crop";
import type { Photo } from "@/lib/types";

// A photo or video filling the whole screen behind a page (the Info page). It
// sits behind the header and footer; the `.page-backdrop` class tells the CSS
// to turn them white with a black outline, as over the main-page photos.
//
// It is behind everything, so it can't be clicked: a video plays muted, with
// no sound button.
export default function PageBackdrop({ item }: { item: Photo }) {
  const w = item.width ?? 1500;
  const h = item.height ?? 1000;
  // The item's mobile framing decides which part stays in view.
  const objectPosition = cropObjectPosition(
    resolveCrop(
      { x: item.mobile_crop_x, y: item.mobile_crop_y, w: item.mobile_crop_w, h: item.mobile_crop_h },
      w,
      h,
    ),
  );

  // Covering the screen can need more than 100vw: a landscape photo filling a
  // tall phone screen is drawn about 2.2 × its width-ratio wider than the
  // screen. Ask for a source that wide, so it isn't upscaled and soft.
  const ratio = w / h;
  const portrait = Math.min(400, Math.max(100, Math.ceil(ratio * 220)));
  const landscape = Math.min(400, Math.max(100, Math.ceil(ratio * 62.5)));
  const sizes = `(orientation: portrait) ${portrait}vw, ${landscape}vw`;

  return (
    <div className="page-backdrop fixed inset-0 -z-10" aria-hidden>
      {item.media_type === "video" ? (
        <VideoPlayer
          video={item}
          eager
          sound={false}
          className="h-full w-full object-cover"
          style={{ objectPosition }}
        />
      ) : (
        <Image
          src={publicUrl(item.storage_path)}
          alt=""
          fill
          priority
          quality={90}
          sizes={sizes}
          className="object-cover"
          style={{ objectPosition }}
        />
      )}
    </div>
  );
}
