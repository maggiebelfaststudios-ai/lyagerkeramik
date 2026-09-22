import { createClient } from "@/lib/supabase/server";
import AdminApp from "@/components/admin/AdminApp";
import type { Photo, Folder } from "@/lib/types";

// Always render fresh in the admin.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();

  const [{ data: photos }, { data: folders }, settings] = await Promise.all([
    supabase
      .from("photos")
      .select("*")
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("folders")
      .select("*")
      .order("display_order", { ascending: true }),
    supabase
      .from("site_settings")
      .select("info_background_id")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  return (
    <AdminApp
      photos={(photos as Photo[]) ?? []}
      folders={(folders as Folder[]) ?? []}
      // undefined: the settings table doesn't exist yet (migration 0007).
      infoBackgroundId={
        settings.error ? undefined : (settings.data?.info_background_id ?? null)
      }
    />
  );
}
