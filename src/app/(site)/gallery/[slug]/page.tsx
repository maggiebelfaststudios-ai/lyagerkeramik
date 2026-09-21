import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import FolderGallery from "@/components/FolderGallery";
import type { Photo, Folder } from "@/lib/types";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("folders")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  return { title: `${data?.name ?? "Folder"} — Gitte Lyager` };
}

export default async function FolderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: folderData } = await supabase
    .from("folders")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  const folder = folderData as Folder | null;
  if (!folder) notFound();

  const { data: photoRows } = await supabase
    .from("photos")
    .select("*")
    .eq("folder_id", folder.id)
    .order("captured_at", { ascending: true, nullsFirst: false })
    .order("uploaded_at", { ascending: true });

  const photos: Photo[] = photoRows ?? [];

  return (
    <div className="mx-auto max-w-column px-5 py-12 sm:px-8">
      <nav className="mb-4 font-mono text-2xs uppercase tracking-[0.15em] text-muted">
        <Link href="/gallery" className="hover:text-ink">
          Gallery
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-ink">{folder.name}</span>
      </nav>

      {folder.description && (
        <p className="mb-6 max-w-prose text-muted">{folder.description}</p>
      )}

      <FolderGallery title={folder.name} photos={photos} />
    </div>
  );
}
