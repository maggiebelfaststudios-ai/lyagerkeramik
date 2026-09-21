// Flat folder glyph — outline only, no fill kitsch.
export default function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      className={className}
      aria-hidden
    >
      <path d="M1 3.5h6l1.5 2H19v9H1z" />
      <path d="M1 3.5V2h5l1.5 1.5" />
    </svg>
  );
}
