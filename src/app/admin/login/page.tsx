"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    router.replace(redirect);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xs">
      <h1 className="mb-1 text-center text-lg">Gitte Lyager</h1>
      <p className="mb-8 text-center font-mono text-2xs uppercase tracking-[0.2em] text-muted">
        Admin
      </p>

      <label className="mb-3 block">
        <span className="mb-1 block font-mono text-2xs uppercase tracking-[0.15em] text-muted">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full border border-line bg-surface px-3 py-2 outline-none focus:border-ink"
        />
      </label>

      <label className="mb-6 block">
        <span className="mb-1 block font-mono text-2xs uppercase tracking-[0.15em] text-muted">
          Password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full border border-line bg-surface px-3 py-2 outline-none focus:border-ink"
        />
      </label>

      {error && <p className="mb-4 font-mono text-2xs text-ink">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full border border-ink bg-ink px-3 py-2 font-mono text-2xs uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
