import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import PhotoImage from "@/components/PhotoImage";
import VideoPlayer from "@/components/VideoPlayer";
import { formatDateTime } from "@/lib/format";
import type { Photo, Folder } from "@/lib/types";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("folders")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  return { title: `${data?.name ?? "Piece"} — Gitte Lyager` };
}

function MetaRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-6 border-b border-line py-1.5">
      <dt className="uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

export default async function PhotoView({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const { data: folderData } = await supabase
    .from("folders")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  const folder = folderData as Folder | null;
  if (!folder) notFound();

  const { data: photoData } = await supabase
    .from("photos")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const photo = photoData as Photo | null;
  if (!photo || photo.folder_id !== folder.id) notFound();

  return (
    <div className="mx-auto max-w-column px-5 py-12 sm:px-8">
      <nav className="mb-6 font-mono text-2xs uppercase tracking-[0.15em] text-muted">
        <Link href="/gallery" className="hover:text-ink">
          Gallery
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/gallery/${folder.slug}`} className="hover:text-ink">
          {folder.name}
        </Link>
      </nav>

      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
        <div className="relative md:flex-1">
          {photo.media_type === "video" ? (
            <VideoPlayer video={photo} eager className="block h-auto w-full" />
          ) : (
            <PhotoImage
              photo={photo}
              priority
              sizes="(max-width: 768px) 100vw, 720px"
              className="h-auto w-full"
            />
          )}
        </div>

        <aside className="md:w-56 md:shrink-0">
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
    </div>
  );
}
