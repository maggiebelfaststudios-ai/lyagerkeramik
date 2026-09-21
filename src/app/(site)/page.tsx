import { createClient } from "@/lib/supabase/server";
import PhotoImage from "@/components/PhotoImage";
import VideoPlayer from "@/components/VideoPlayer";
import { resolveCrop, cropVars, cropSizes } from "@/lib/crop";
import type { Photo } from "@/lib/types";

export const revalidate = 60;

export default async function HomePage() {
  const supabase = await createClient();
  // The desktop and mobile feeds are independent sets; fetch their union.
  const { data } = await supabase
    .from("photos")
    .select("*")
    .or("on_main_page.eq.true,on_mobile.eq.true");

  const photos: Photo[] = data ?? [];

  if (photos.length === 0) {
    return <div className="min-h-[50vh]" />;
  }

  // Independent ordering per device → flex `order` indices.
  const desktopIndex = new Map(
    photos
      .filter((p) => p.on_main_page)
      .sort((a, b) => (a.main_page_order ?? 0) - (b.main_page_order ?? 0))
      .map((p, i) => [p.id, i] as const),
  );
  const mobileIndex = new Map(
    photos
      .filter((p) => p.on_mobile)
      .sort((a, b) => (a.mobile_order ?? 0) - (b.mobile_order ?? 0))
      .map((p, i) => [p.id, i] as const),
  );

  // Render in desktop order for a sensible DOM/source order.
  const ordered = [...photos].sort(
    (a, b) => (desktopIndex.get(a.id) ?? 999) - (desktopIndex.get(b.id) ?? 999),
  );

  return (
    <div className="home-feed flex flex-col">
      {ordered.map((photo, i) => {
        const crop = resolveCrop(
          {
            x: photo.mobile_crop_x,
            y: photo.mobile_crop_y,
            w: photo.mobile_crop_w,
            h: photo.mobile_crop_h,
          },
          photo.width ?? 1500,
          photo.height ?? 1000,
        );
        const cls = [
          "m-0",
          photo.on_main_page ? "on-desktop" : "",
          photo.on_mobile ? "on-mobile" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <figure
            key={photo.id}
            className={cls}
            style={
              {
                "--do": String(desktopIndex.get(photo.id) ?? 0),
                "--mo": String(mobileIndex.get(photo.id) ?? 0),
              } as React.CSSProperties
            }
          >
            <div
              className="mobile-crop"
              style={cropVars(crop) as React.CSSProperties}
            >
              {photo.media_type === "video" ? (
                <VideoPlayer
                  video={photo}
                  eager={i === 0}
                  className="block h-auto w-full"
                />
              ) : (
                <PhotoImage
                  photo={photo}
                  priority={i === 0}
                  sizes={cropSizes(crop)}
                  quality={90}
                  className="block h-auto w-full"
                />
              )}
            </div>
          </figure>
        );
      })}
    </div>
  );
}
