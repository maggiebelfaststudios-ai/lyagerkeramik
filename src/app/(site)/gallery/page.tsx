import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import FileWindow from "@/components/FileWindow";
import FolderIcon from "@/components/FolderIcon";
import type { Folder } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Gallery — Gitte Lyager",
};

export default async function GalleryPage() {
  const supabase = await createClient();

  const [{ data: folderRows }, { data: photoRows }] = await Promise.all([
    supabase.from("folders").select("*").order("display_order", { ascending: true }),
    supabase.from("photos").select("folder_id"),
  ]);

  const folders: Folder[] = folderRows ?? [];

  // Tally photo counts per folder.
  const counts = new Map<string, number>();
  for (const row of photoRows ?? []) {
    if (row.folder_id)
      counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-column px-5 py-12 sm:px-8">
      <FileWindow title="Gallery" right={`${folders.length} folders`}>
        {folders.length === 0 ? (
          <p className="px-4 py-10 text-center font-mono text-2xs uppercase tracking-[0.15em] text-muted">
            No folders yet
          </p>
        ) : (
          <ul>
            {/* Column header row */}
            <li className="flex items-center gap-3 border-b border-line px-4 py-1.5 font-mono text-2xs uppercase tracking-[0.15em] text-muted">
              <span className="w-5" aria-hidden />
              <span className="flex-1">Name</span>
              <span className="w-16 text-right">Items</span>
            </li>

            {folders.map((folder) => (
              <li key={folder.id} className="border-b border-line last:border-b-0">
                <Link
                  href={`/gallery/${folder.slug}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-paper"
                >
                  <FolderIcon className="w-5 text-ink" />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{folder.name}</span>
                    {folder.description && (
                      <span className="block truncate font-mono text-2xs text-muted">
                        {folder.description}
                      </span>
                    )}
                  </span>
                  <span className="w-16 text-right font-mono text-2xs text-muted">
                    {counts.get(folder.id) ?? 0}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </FileWindow>
    </div>
  );
}
