"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { publicUrl, stillPath } from "@/lib/images";
import type { Photo } from "@/lib/types";

interface Props {
  // For a video, the poster frame is shown.
  photo: Pick<Photo, "storage_path" | "width" | "height" | "description"> &
    Partial<Pick<Photo, "media_type" | "poster_path">>;
  // The `sizes` attribute the layout will actually render at.
  sizes: string;
  priority?: boolean;
  className?: string;
  // 1–100. Omit for the Next default (75); raise for large display.
  quality?: number;
}

// Single source of truth for rendering a stored photo. Shows a circular
// spinner until the image has loaded. The parent must be position:relative.
export default function PhotoImage({
  photo,
  sizes,
  priority = false,
  className,
  quality,
}: Props) {
  const width = photo.width ?? 1500;
  const height = photo.height ?? 1000;
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Cached images may already be complete before onLoad can fire.
  useEffect(() => {
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  return (
    <>
      <Image
        ref={imgRef}
        src={publicUrl(stillPath(photo))}
        alt={photo.description ?? ""}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        quality={quality}
        onLoad={() => setLoaded(true)}
        className={className}
      />
      {!loaded && <span className="spinner" aria-hidden />}
    </>
  );
}
