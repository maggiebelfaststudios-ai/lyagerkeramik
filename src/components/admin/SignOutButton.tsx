"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="font-mono text-2xs uppercase tracking-[0.15em] text-muted hover:text-ink"
    >
      Sign out
    </button>
  );
}
