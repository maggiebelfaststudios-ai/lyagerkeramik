"use client";

import { useEffect, useRef, useState } from "react";
import { getImageProps } from "next/image";
import { publicUrl } from "@/lib/images";
import type { Photo } from "@/lib/types";

type Video = Pick<
  Photo,
  "storage_path" | "poster_path" | "width" | "height" | "has_audio" | "description"
>;

// A looping clip that plays muted while it's on screen and pauses when it
// isn't. A speaker button in the bottom-right corner turns the sound on. Renders
// the <video> and the button as siblings, so the parent (position: relative)
// frames both. That keeps the mobile crop CSS (.mobile-crop > video) working.
export default function VideoPlayer({
  video,
  className,
  eager = false,
  soundClassName = "absolute bottom-3 right-3",
  onReady,
}: {
  video: Video;
  className?: string;
  // Start loading straight away (first item on the page, the lightbox).
  eager?: boolean;
  soundClassName?: string;
  onReady?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const width = video.width ?? 1080;
  const height = video.height ?? 1920;

  // The poster goes through Next's image optimiser like any photo.
  const poster = video.poster_path
    ? getImageProps({
        src: publicUrl(video.poster_path),
        alt: "",
        width,
        height,
        quality: 90,
      }).props.src
    : undefined;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Muted playback is what browsers allow without a tap. React doesn't render
    // the `muted` attribute, so set the property before any play().
    el.muted = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.25) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: [0, 0.25] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function toggleSound() {
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    // A tap counts as permission to play, e.g. when Low Power Mode blocked autoplay.
    if (el.paused) el.play().catch(() => {});
  }

  return (
    <>
      <video
        ref={ref}
        src={publicUrl(video.storage_path)}
        poster={poster}
        width={width}
        height={height}
        muted
        loop
        playsInline
        preload={eager ? "auto" : "none"}
        aria-label={video.description ?? undefined}
        onLoadedMetadata={onReady}
        onClick={(e) => {
          if (e.currentTarget.paused) e.currentTarget.play().catch(() => {});
        }}
        className={className}
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      {video.has_audio && (
        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className={`${soundClassName} z-10 bg-paper/70 p-1.5 text-ink transition-colors hover:bg-paper`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            {muted ? (
              <path d="M17 9l5 6M22 9l-5 6" />
            ) : (
              <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
            )}
          </svg>
        </button>
      )}
    </>
  );
}

// Small marker on a thumbnail that is a video. The parent must be relative.
export function PlayBadge({ className = "bottom-1.5 right-1.5" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute z-10 bg-paper/80 p-1 text-ink ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-2.5 w-2.5">
        <path d="M7 4v16l13-8z" />
      </svg>
    </span>
  );
}
