"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LibrarySidebar from "./LibrarySidebar";
import FeedCanvas from "./FeedCanvas";
import InfoBackgroundCanvas from "./InfoBackgroundCanvas";
import PhotoEditorModal from "./PhotoEditorModal";
import SignOutButton from "./SignOutButton";
import type { Photo, Folder } from "@/lib/types";

type Tab = "desktop" | "mobile" | "info";

const TAB_LABELS: Record<Tab, string> = {
  desktop: "Desktop main page",
  mobile: "Mobile main page",
  info: "Info page",
};

export default function AdminApp({
  photos,
  folders,
  infoBackgroundId,
}: {
  photos: Photo[];
  folders: Folder[];
  infoBackgroundId: string | null | undefined; // undefined: not set up yet
}) {
  const router = useRouter();
  const [feed, setFeed] = useState<Tab>("desktop");
  const [editing, setEditing] = useState<Photo | null>(null);

  const refresh = () => router.refresh();

  const desktopItems = photos
    .filter((p) => p.on_main_page)
    .sort((a, b) => (a.main_page_order ?? 0) - (b.main_page_order ?? 0));
  const mobileItems = photos
    .filter((p) => p.on_mobile)
    .sort((a, b) => (a.mobile_order ?? 0) - (b.mobile_order ?? 0));

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-2xs uppercase tracking-[0.18em] text-ink">
          Gitte Lyager — Admin
        </span>
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="font-mono text-2xs uppercase tracking-[0.15em] text-muted hover:text-ink"
          >
            View site
          </Link>
          <SignOutButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LibrarySidebar
          photos={photos}
          folders={folders}
          onChanged={refresh}
          onEdit={setEditing}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <nav className="flex gap-1 border-b border-line px-5">
            {(["desktop", "mobile", "info"] as Tab[]).map((f) => (
              <button
                key={f}
                onClick={() => setFeed(f)}
                className={`-mb-px border-b-2 px-3 py-2 font-mono text-2xs uppercase tracking-[0.15em] transition-colors ${
                  feed === f
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {TAB_LABELS[f]}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {feed === "info" ? (
              <InfoBackgroundCanvas
                current={photos.find((p) => p.id === infoBackgroundId) ?? null}
                ready={infoBackgroundId !== undefined}
                onChanged={refresh}
                onEdit={setEditing}
              />
            ) : (
              <FeedCanvas
                key={feed}
                feed={feed}
                items={feed === "desktop" ? desktopItems : mobileItems}
                onChanged={refresh}
                onEdit={setEditing}
              />
            )}
          </div>
        </main>
      </div>

      {editing && (
        <PhotoEditorModal
          photo={editing}
          onClose={() => setEditing(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
