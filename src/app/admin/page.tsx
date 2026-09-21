import { createClient } from "@/lib/supabase/server";
import AdminApp from "@/components/admin/AdminApp";
import type { Photo, Folder } from "@/lib/types";

// Always render fresh in the admin.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();

  const [{ data: photos }, { data: folders }] = await Promise.all([
    supabase
      .from("photos")
      .select("*")
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("folders")
      .select("*")
      .order("display_order", { ascending: true }),
  ]);

  return (
    <AdminApp
      photos={(photos as Photo[]) ?? []}
      folders={(folders as Folder[]) ?? []}
    />
  );
}
