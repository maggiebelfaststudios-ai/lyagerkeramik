// Public site footer: name and year, nothing else. Full width.
export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="px-6 py-10 sm:px-10">
      <div className="flex items-baseline justify-between font-mono text-2xs uppercase tracking-[0.18em] text-muted">
        <span>Gitte Lyager</span>
        <span>{year}</span>
      </div>
    </footer>
  );
}
