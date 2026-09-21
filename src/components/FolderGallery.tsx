"use client";

import { useState } from "react";
import FileWindow from "@/components/FileWindow";
import PhotoImage from "@/components/PhotoImage";
import Lightbox from "@/components/Lightbox";
import { PlayBadge } from "@/components/VideoPlayer";
import { formatDate } from "@/lib/format";
import type { Photo } from "@/lib/types";

// Folder contents grid; clicking a thumbnail opens the in-window viewer.
export default function FolderGallery({
  title,
  photos,
}: {
  title: string;
  photos: Photo[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <FileWindow title={title} right={`${photos.length} items`}>
        {photos.length === 0 ? (
          <p className="px-4 py-10 text-center font-mono text-2xs uppercase tracking-[0.15em] text-muted">
            Empty folder
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo, i) => (
              <li key={photo.id} className="bg-surface">
                <button
                  onClick={() => setOpenIndex(i)}
                  className="flex w-full flex-col gap-2 p-3 text-left transition-colors hover:bg-paper"
                >
                  <span className="relative flex aspect-square items-center justify-center overflow-hidden bg-paper">
                    <PhotoImage
                      photo={photo}
                      sizes="(max-width: 640px) 45vw, 240px"
                      className="h-full w-full object-cover"
                    />
                    {photo.media_type === "video" && <PlayBadge />}
                  </span>
                  <span className="text-center font-mono text-2xs text-muted">
                    {formatDate(photo.captured_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </FileWindow>

      {openIndex !== null && (
        <Lightbox
          photos={photos}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
