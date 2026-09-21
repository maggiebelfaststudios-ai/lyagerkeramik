"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { publicUrl } from "@/lib/images";
import { formatDateTime } from "@/lib/format";
import VideoPlayer from "@/components/VideoPlayer";
import type { Photo } from "@/lib/types";

// WebKit-prefixed fullscreen members (macOS / iPad / older Safari).
type FsDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FsElement = HTMLDivElement & {
  webkitRequestFullscreen?: () => void;
};

function MetaRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-6 border-b border-line py-1.5">
      <dt className="uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

// In-window photo viewer: cycle through a folder's photos, metadata beside.
export default function Lightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: Photo[];
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const [fsEnabled, setFsEnabled] = useState(false);
  const [isFs, setIsFs] = useState(false);

  // Fullscreen support is feature-detected, including the WebKit-prefixed API
  // used by older / macOS / iPad Safari. iPhone Safari has neither, so the
  // button is hidden there (Apple only allows fullscreen for <video>).
  useEffect(() => {
    const d = document as FsDocument;
    setFsEnabled(Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled));
    const onChange = () =>
      setIsFs(Boolean(d.fullscreenElement || d.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  function toggleFullscreen() {
    const d = document as FsDocument;
    const el = fsRef.current as FsElement | null;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      if (d.exitFullscreen) d.exitFullscreen();
      else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
    } else if (el) {
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  }

  // Reset the loading state for each new image (handle cached ones).
  useEffect(() => {
    setLoaded(false);
    const id = requestAnimationFrame(() => {
      if (imgRef.current?.complete) setLoaded(true);
    });
    return () => cancelAnimationFrame(id);
  }, [index]);

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + photos.length) % photos.length),
    [photos.length],
  );
  const next = useCallback(
    () => setIndex((i) => (i + 1) % photos.length),
    [photos.length],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, prev, next]);

  const photo = photos[index];
  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-paper md:flex md:flex-row md:overflow-hidden">
      {/* Always-visible close on mobile (info panel sits below the photo there) */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed right-4 top-4 z-20 font-mono text-2xs uppercase tracking-[0.15em] text-muted hover:text-ink md:hidden"
      >
        Close
      </button>

      {/* Image area */}
      <div
        ref={fsRef}
        className="relative flex items-center justify-center bg-paper p-4 md:min-h-0 md:flex-1 md:p-8"
      >
        {photo.media_type === "video" ? (
          // Fills the area; object-contain letterboxes it like the photos.
          <VideoPlayer
            key={photo.id}
            video={photo}
            eager
            onReady={() => setLoaded(true)}
            className="block max-h-[88svh] w-full bg-transparent object-contain md:h-full md:max-h-none"
            soundClassName={`absolute bottom-3 ${fsEnabled ? "right-12" : "right-3"}`}
          />
        ) : (
          <Image
            key={photo.id}
            ref={imgRef}
            src={publicUrl(photo.storage_path)}
            alt={photo.description ?? ""}
            width={photo.width ?? 1500}
            height={photo.height ?? 1000}
            sizes="100vw"
            quality={90}
            onLoad={() => setLoaded(true)}
            className="h-auto max-h-[88svh] w-auto max-w-full object-contain md:max-h-full"
            priority
          />
        )}

        {!loaded && <span className="spinner" aria-hidden />}

        {photos.length > 1 && (
          <>
            <button
              onClick={prev}
              aria-label="Previous"
              className="absolute left-3 top-1/2 -translate-y-1/2 px-3 py-2 font-mono text-xl text-muted hover:text-ink"
            >
              ‹
            </button>
            <button
              onClick={next}
              aria-label="Next"
              className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-2 font-mono text-xl text-muted hover:text-ink"
            >
              ›
            </button>
          </>
        )}

        {fsEnabled && (
          <button
            onClick={toggleFullscreen}
            aria-label={isFs ? "Exit fullscreen" : "View fullscreen"}
            className="absolute bottom-3 right-3 z-10 bg-paper/70 p-1.5 text-ink transition-colors hover:bg-paper"
          >
            {isFs ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Info panel */}
      <aside className="w-full shrink-0 overflow-y-auto border-t border-line p-5 md:w-72 md:border-l md:border-t-0">
        <div className="mb-4 flex items-center justify-between font-mono text-2xs uppercase tracking-[0.15em]">
          <span className="text-muted">
            {index + 1} / {photos.length}
          </span>
          <button onClick={onClose} className="text-muted hover:text-ink">
            Close
          </button>
        </div>

        <dl className="font-mono text-2xs">
          <MetaRow label="Captured" value={formatDateTime(photo.captured_at)} />
          <MetaRow label="Shutter" value={photo.shutter_speed} />
          <MetaRow label="Aperture" value={photo.aperture} />
          <MetaRow label="Focal" value={photo.focal_length} />
          <MetaRow
            label="ISO"
            value={photo.iso != null ? String(photo.iso) : null}
          />
          <MetaRow label="Camera" value={photo.camera} />
          <MetaRow label="Lens" value={photo.lens} />
        </dl>

        {photo.description && (
          <p className="mt-5 text-muted">{photo.description}</p>
        )}
      </aside>
    </div>
  );
}
