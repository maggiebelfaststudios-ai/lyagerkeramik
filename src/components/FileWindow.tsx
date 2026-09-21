// A spare "window" frame echoing classic file managers — hairline border,
// a thin title bar, sharp corners. No bevels, no gradients, no shadows.
export default function FileWindow({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-ink/80 bg-surface">
      <div className="flex items-center gap-2 border-b border-ink/80 bg-paper px-3 py-1.5">
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 border border-ink/70" />
          <span className="h-2 w-2 border border-ink/70" />
        </span>
        <span className="flex-1 truncate text-center font-mono text-2xs uppercase tracking-[0.15em] text-ink">
          {title}
        </span>
        <span className="min-w-[1rem] text-right font-mono text-2xs text-muted">
          {right}
        </span>
      </div>
      {children}
    </div>
  );
}
