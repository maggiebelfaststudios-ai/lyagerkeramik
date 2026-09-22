import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import PageBackdrop from "@/components/PageBackdrop";
import type { Photo } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Info — Gitte Lyager",
};

// The background chosen in the admin's "Info page" tab, if any. Quietly none if
// the settings table doesn't exist yet (migration 0007 not run).
async function infoBackground(): Promise<Photo | null> {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("info_background_id")
    .eq("id", 1)
    .maybeSingle();
  if (!settings?.info_background_id) return null;
  const { data } = await supabase
    .from("photos")
    .select("*")
    .eq("id", settings.info_background_id)
    .maybeSingle();
  return (data as Photo | null) ?? null;
}

export default async function InfoPage() {
  const background = await infoBackground();

  return (
    <div
      className={`flex min-h-[65vh] flex-col items-center justify-center px-6 text-center ${
        background ? "text-outline" : ""
      }`}
    >
      {background && <PageBackdrop item={background} />}
      <h1
        className={`mb-10 font-mono text-2xs uppercase tracking-[0.28em] ${
          background ? "" : "text-muted"
        }`}
      >
        Contact
      </h1>
      <div className="space-y-3 font-serif text-lg">
        <p>gittelyager84@gmail.com</p>
        <p>
          <a
            href="tel:+4550969217"
            className={background ? "hover:opacity-75" : "transition-colors hover:text-muted"}
          >
            +45 50 96 92 17
          </a>
        </p>
        <p>@lyagerkeramik</p>
      </div>
    </div>
  );
}
