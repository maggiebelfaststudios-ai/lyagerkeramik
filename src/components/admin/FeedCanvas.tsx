"use client";

import { Fragment, useRef, useState } from "react";
import { publicUrl, stillPath } from "@/lib/images";
import { PlayBadge } from "@/components/VideoPlayer";
import {
  setOnMainPage,
  setOnMobile,
  reorderMainPage,
  reorderMobile,
} from "@/app/admin/actions";
import type { Photo } from "@/lib/types";

// One main-page feed (desktop or mobile). Drop photos from the library to add,
// drag rows to reorder, × to remove, click a thumbnail to edit. A line shows
// exactly where a dragged photo will land.
export default function FeedCanvas({
  feed,
  items,
  onChanged,
  onEdit,
}: {
  feed: "desktop" | "mobile";
  items: Photo[];
  onChanged: () => void;
  onEdit: (p: Photo) => void;
}) {
  const ids = items.map((p) => p.id);
  const setMember = feed === "desktop" ? setOnMainPage : setOnMobile;
  const reorder = feed === "desktop" ? reorderMainPage : reorderMobile;

  // Insertion point (0..items.length) shown while dragging.
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dropRef = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function setDrop(i: number | null) {
    dropRef.current = i;
    setDropIndex(i);
  }

  // Final id order with `id` inserted at the indicator position.
  function computeFinal(id: string, insertion: number): string[] {
    const without = ids.filter((x) => x !== id);
    const orig = ids.indexOf(id);
    let target = insertion;
    if (orig !== -1 && orig < insertion) target -= 1;
    target = Math.max(0, Math.min(without.length, target));
    return [...without.slice(0, target), id, ...without.slice(target)];
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const d = e.dataTransfer.getData("text/plain");
    const id = d.startsWith("reorder:")
      ? d.slice(8)
      : d.startsWith("photo:")
        ? d.slice(6)
        : "";
    const insertion = dropRef.current ?? items.length;
    setDrop(null);
    setDraggingId(null);
    if (!id) return;

    const finalIds = computeFinal(id, insertion);
    if (!ids.includes(id)) await setMember(id, true);
    await reorder(finalIds);
    onChanged();
  }

  const Indicator = () => <li className="my-1 h-[3px] list-none bg-ink" />;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrop(items.length);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
      }}
      onDrop={handleDrop}
      className="min-h-[60vh] border border-dashed border-line p-3"
    >
      {items.length === 0 && (
        <p className="py-16 text-center font-mono text-2xs uppercase tracking-[0.15em] text-muted">
          Drag photos here from the library
        </p>
      )}

      <ul>
        {items.map((p, index) => (
          <Fragment key={p.id}>
            {dropIndex === index && <Indicator />}
            <li
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", `reorder:${p.id}`);
                setDraggingId(p.id);
              }}
              onDragEnd={() => {
                setDrop(null);
                setDraggingId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > r.top + r.height / 2;
                setDrop(after ? index + 1 : index);
              }}
              className={`flex cursor-grab items-center gap-3 border border-line bg-surface p-2 active:cursor-grabbing ${
                draggingId === p.id ? "opacity-40" : ""
              }`}
            >
              <span className="font-mono text-2xs text-muted">↕</span>
              <button onClick={() => onEdit(p)} title="Edit" className="relative shrink-0">
                <img
                  src={publicUrl(stillPath(p))}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="h-12 w-12 object-cover"
                />
                {p.media_type === "video" && <PlayBadge className="bottom-0.5 right-0.5" />}
              </button>
              <span className="flex-1 truncate font-mono text-2xs text-ink">
                {p.filename}
              </span>
              <button
                onClick={() => remove(p.id)}
                title="Remove from feed"
                className="font-mono text-2xs uppercase tracking-[0.12em] text-muted hover:text-ink"
              >
                ✕
              </button>
            </li>
          </Fragment>
        ))}
        {dropIndex === items.length && <Indicator />}
      </ul>
    </div>
  );

  async function remove(id: string) {
    await setMember(id, false);
    onChanged();
  }
}
