"use client";

import { useState } from "react";
import { publicUrl, stillPath } from "@/lib/images";
import { PlayBadge } from "@/components/VideoPlayer";
import {
  createFolder,
  assignPhotoFolder,
  updateFolder,
  deleteFolder,
  reorderFolders,
} from "@/app/admin/actions";
import Uploader from "./Uploader";
import type { Photo, Folder } from "@/lib/types";

// Draggable thumbnail of a library photo. Carries `photo:<id>` so feed canvases
// and folders can decide what to do on drop.
function LibPhoto({
  photo,
  folderId,
  onEdit,
  onChanged,
}: {
  photo: Photo;
  folderId: string | null;
  onEdit: (p: Photo) => void;
  onChanged: () => void;
}) {
  async function setCover() {
    if (folderId) {
      await updateFolder(folderId, { cover_photo_id: photo.id });
      onChanged();
    }
  }
  return (
    <div
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData("text/plain", `photo:${photo.id}`)
      }
      className="group relative aspect-square cursor-grab overflow-hidden border border-line active:cursor-grabbing"
      title={photo.filename ?? ""}
    >
      <img
        src={publicUrl(stillPath(photo))}
        alt=""
        loading="lazy"
        className="pointer-events-none h-full w-full object-cover"
      />
      {photo.media_type === "video" && <PlayBadge className="right-1 top-1" />}
      <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-paper/80 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onEdit(photo)}
          className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-muted hover:text-ink"
        >
          Edit
        </button>
        {folderId && (
          <button
            onClick={setCover}
            title="Set as folder cover"
            className="font-mono text-[0.5rem] uppercase tracking-[0.1em] text-muted hover:text-ink"
          >
            Cover
          </button>
        )}
      </div>
    </div>
  );
}

function FolderGroup({
  title,
  count,
  folderId,
  photos,
  onEdit,
  onChanged,
  controls,
}: {
  title: string;
  count: number;
  folderId: string | null;
  photos: Photo[];
  onEdit: (p: Photo) => void;
  onChanged: () => void;
  controls?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <div className="border-b border-line">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          const d = e.dataTransfer.getData("text/plain");
          if (d.startsWith("photo:")) {
            assignPhotoFolder(d.slice(6), folderId).then(onChanged);
          }
        }}
        className={`flex items-center gap-2 px-2 py-1.5 ${over ? "bg-paper" : ""}`}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-mono text-2xs text-muted"
        >
          {open ? "▾" : "▸"}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 truncate text-left font-mono text-2xs uppercase tracking-[0.12em] text-ink"
        >
          {title}
        </button>
        <span className="font-mono text-2xs text-muted">{count}</span>
        {controls}
      </div>
      {open && (
        <div className="grid grid-cols-3 gap-1 p-2 pt-0">
          {photos.length === 0 ? (
            <p className="col-span-3 font-mono text-2xs text-muted">
              Drop photos here
            </p>
          ) : (
            photos.map((p) => (
              <LibPhoto
                key={p.id}
                photo={p}
                folderId={folderId}
                onEdit={onEdit}
                onChanged={onChanged}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function LibrarySidebar({
  photos,
  folders,
  onChanged,
  onEdit,
}: {
  photos: Photo[];
  folders: Folder[];
  onChanged: () => void;
  onEdit: (p: Photo) => void;
}) {
  const [newFolder, setNewFolder] = useState("");

  const unfiled = photos.filter((p) => !p.folder_id);
  const ordered = [...folders].sort(
    (a, b) => a.display_order - b.display_order,
  );

  async function create() {
    if (!newFolder.trim()) return;
    await createFolder(newFolder);
    setNewFolder("");
    onChanged();
  }

  async function moveFolder(index: number, dir: -1 | 1) {
    const next = ordered.map((f) => f.id);
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await reorderFolders(next);
    onChanged();
  }

  async function removeFolder(f: Folder) {
    if (!confirm(`Delete folder “${f.name}”? Photos become unfiled.`)) return;
    await deleteFolder(f.id);
    onChanged();
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-line bg-paper">
      <section className="border-b border-line p-3">
        <h3 className="mb-2 font-mono text-2xs uppercase tracking-[0.18em] text-muted">
          Upload
        </h3>
        <Uploader onChanged={onChanged} />
      </section>

      <section className="border-b border-line p-3">
        <h3 className="mb-2 font-mono text-2xs uppercase tracking-[0.18em] text-muted">
          New folder
        </h3>
        <div className="flex gap-2">
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="Folder name"
            className="min-w-0 flex-1 border border-line bg-surface px-2 py-1 outline-none focus:border-ink"
          />
          <button
            onClick={create}
            className="shrink-0 border border-ink bg-ink px-3 py-1 font-mono text-2xs uppercase tracking-[0.1em] text-paper hover:opacity-85"
          >
            Add
          </button>
        </div>
      </section>

      <div className="flex-1">
        <FolderGroup
          title="Unfiled"
          count={unfiled.length}
          folderId={null}
          photos={unfiled}
          onEdit={onEdit}
          onChanged={onChanged}
        />
        {ordered.map((f, i) => (
          <FolderGroup
            key={f.id}
            title={f.name}
            count={photos.filter((p) => p.folder_id === f.id).length}
            folderId={f.id}
            photos={photos.filter((p) => p.folder_id === f.id)}
            onEdit={onEdit}
            onChanged={onChanged}
            controls={
              <span className="flex items-center gap-1">
                <button
                  onClick={() => moveFolder(i, -1)}
                  title="Move up"
                  className="font-mono text-2xs text-muted hover:text-ink"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveFolder(i, 1)}
                  title="Move down"
                  className="font-mono text-2xs text-muted hover:text-ink"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeFolder(f)}
                  title="Delete folder"
                  className="font-mono text-2xs text-muted hover:text-ink"
                >
                  ✕
                </button>
              </span>
            }
          />
        ))}
      </div>
    </aside>
  );
}
