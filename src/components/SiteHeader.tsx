"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// On the main page the header floats over the full-bleed photos: fixed,
// transparent, white text with a black outline. Elsewhere it sits in flow.
export default function SiteHeader() {
  const overlay = usePathname() === "/";

  return (
    <header
      className={`z-50 flex items-center justify-between px-6 py-6 sm:px-10 ${
        overlay ? "fixed inset-x-0 top-0" : "relative"
      }`}
    >
      <Link
        href="/"
        className={`flex flex-col leading-none ${
          overlay ? "text-outline" : "text-ink"
        }`}
      >
        <span
          className={`mb-1 font-mono text-[0.5rem] uppercase tracking-[0.28em] sm:text-[0.55rem] ${
            overlay ? "" : "text-muted"
          }`}
        >
          Keramik af
        </span>
        <span className="font-serif text-base tracking-wide sm:text-lg">
          Gitte Lyager
        </span>
      </Link>
      <nav
        className={`flex gap-5 font-mono text-2xs uppercase tracking-[0.18em] ${
          overlay ? "text-outline" : "text-muted"
        }`}
      >
        <Link
          href="/gallery"
          className={overlay ? "hover:opacity-75" : "transition-colors hover:text-ink"}
        >
          Gallery
        </Link>
        <Link
          href="/info"
          className={overlay ? "hover:opacity-75" : "transition-colors hover:text-ink"}
        >
          Info
        </Link>
      </nav>
    </header>
  );
}
