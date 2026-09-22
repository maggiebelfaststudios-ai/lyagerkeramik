"use client";

import { useState } from "react";
import { publicUrl, stillPath } from "@/lib/images";
import { setInfoBackground } from "@/app/admin/actions";
import { PlayBadge } from "@/components/VideoPlayer";
import type { Photo } from "@/lib/types";

// The Info page background. Drop a photo or video from the library to set or
// replace it; ✕ removes it. Click the picture to edit its mobile framing, which
// also decides what part of it stays in view on phones.
export default function InfoBackgroundCanvas({
  current,
  ready,
  onChanged,
  onEdit,
}: {
  current: Photo | null;
  ready: boolean; // false until migration 0007 has been run
  onChanged: () => void;
  onEdit: (p: Photo) => void;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function set(id: string | null) {
    setBusy(true);
    try {
      await setInfoBackground(id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <p className="border border-dashed border-line p-6 font-mono text-2xs uppercase tracking-[0.15em] text-muted">
        Run supabase/migrations/0007_site_settings.sql in the Supabase SQL
        editor, then reload this page.
      </p>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const d = e.dataTransfer.getData("text/plain");
        const id = d.startsWith("photo:") ? d.slice(6) : d.startsWith("reorder:") ? d.slice(8) : "";
        if (id && id !== current?.id) set(id);
      }}
      className={`min-h-[60vh] border border-dashed p-3 ${over ? "border-ink bg-surface" : "border-line"} ${
        busy ? "opacity-60" : ""
      }`}
    >
      {current ? (
        <div className="flex items-start gap-4">
          <button onClick={() => onEdit(current)} title="Edit" className="relative shrink-0">
            <img
              src={publicUrl(stillPath(current))}
              alt=""
              draggable={false}
              className="h-56 w-auto max-w-[24rem] object-contain"
            />
            {current.media_type === "video" && <PlayBadge />}
          </button>
          <div className="min-w-0 flex-1 space-y-2 font-mono text-2xs">
            <p className="truncate text-ink">{current.filename}</p>
            <p className="text-muted">
              Fills the whole Info page behind the contact details. On phones,
              the part shown follows this item&apos;s mobile framing (click the
              picture to change it). Drop another photo or video here to replace
              it.
            </p>
            <button
              onClick={() => set(null)}
              disabled={busy}
              className="uppercase tracking-[0.12em] text-muted hover:text-ink"
            >
              ✕ Remove background
            </button>
          </div>
        </div>
      ) : (
        <p className="py-16 text-center font-mono text-2xs uppercase tracking-[0.15em] text-muted">
          Drag a photo or video here from the library to use it as the Info
          page background
        </p>
      )}
    </div>
  );
}
