import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Info — Gitte Lyager",
};

export default function InfoPage() {
  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-10 font-mono text-2xs uppercase tracking-[0.28em] text-muted">
        Contact
      </h1>
      <div className="space-y-3 font-serif text-lg">
        <p>gittelyager84@gmail.com</p>
        <p>
          <a
            href="tel:+4550969217"
            className="transition-colors hover:text-muted"
          >
            +45 50 96 92 17
          </a>
        </p>
      </div>
    </div>
  );
}
