"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUCKET } from "@/lib/images";
import { ACCEPT, classify, extensionOf, type MediaKind } from "@/lib/media/rules";

interface Item {
  name: string;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  message?: string;
}

type ServerMessage =
  | { type: "progress"; stage: string; ratio?: number }
  | { type: "done"; note: string; log?: string[] }
  | { type: "error"; message: string };

const STAGES: Record<string, string> = {
  download: "preparing",
  optimise: "optimising",
  analyse: "analysing",
  encode: "optimising",
  verify: "checking",
  save: "saving",
};

// Ask the server to optimise and file an uploaded original. Streams progress.
async function importOnServer(
  path: string,
  filename: string,
  kind: MediaKind,
  onProgress: (label: string) => void,
): Promise<string> {
  const res = await fetch("/admin/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, filename, kind }),
  });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !res.body || !type.includes("ndjson")) {
    // An expired session is redirected to the login page (HTML).
    if (res.status === 401 || type.includes("text/html")) {
      throw new Error("Signed out. Reload the page and sign in.");
    }
    throw new Error((await res.text()) || `Server error ${res.status}`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as ServerMessage;
      if (msg.type === "error") throw new Error(msg.message);
      if (msg.type === "done") {
        if (msg.log?.length) console.info(`[import] ${filename}\n  ${msg.log.join("\n  ")}`);
        return msg.note;
      }
      const label = STAGES[msg.stage] ?? msg.stage;
      onProgress(msg.ratio != null ? `${label} ${Math.round(msg.ratio * 100)}%` : label);
    }
  }
  throw new Error(
    "Lost the connection before the server finished. If it doesn't appear in the library within a few minutes, upload it again.",
  );
}

export default function Uploader({ onChanged }: { onChanged?: () => void } = {}) {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Leaving mid-upload loses the file, so warn first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function setStatus(i: number, status: Item["status"], message?: string) {
    setItems((prev) =>
      prev.map((it, idx) => (idx === i ? { ...it, status, message } : it)),
    );
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;

    setBusy(true);
    setItems(list.map((f) => ({ name: f.name, status: "pending" })));

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const verdict = classify(file);
      if ("error" in verdict) {
        setStatus(i, "error", verdict.error);
        continue;
      }

      try {
        // The original goes straight to Storage (no size limit on the way), then
        // the server optimises it and records the row.
        setStatus(i, "uploading");
        const ext = extensionOf(file.name) || (verdict.kind === "video" ? "mp4" : "jpg");
        const path = `incoming/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || (verdict.kind === "video" ? "video/mp4" : "image/jpeg"),
          cacheControl: "31536000",
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);

        setStatus(i, "processing", "preparing");
        const note = await importOnServer(path, file.name, verdict.kind, (label) =>
          setStatus(i, "processing", label),
        );
        setStatus(i, "done", note);
        router.refresh();
        onChanged?.();
      } catch (err) {
        setStatus(i, "error", err instanceof Error ? err.message : "Failed");
      }
    }

    setBusy(false);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center border border-dashed px-6 py-12 text-center font-mono text-2xs uppercase tracking-[0.15em] transition-colors ${
          dragOver ? "border-ink bg-surface text-ink" : "border-line text-muted"
        }`}
      >
        {busy ? "Working… keep this tab open" : "Drop photos or videos here, or click to choose"}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2 font-mono text-2xs">
          {items.map((it, i) => (
            <li key={i}>
              <div className="flex justify-between gap-4">
                <span className="truncate text-ink">{it.name}</span>
                <span className={`shrink-0 ${it.status === "error" ? "text-ink" : "text-muted"}`}>
                  {it.status === "processing" ? it.message : it.status}
                </span>
              </div>
              {(it.status === "done" || it.status === "error") && it.message && (
                <p className={it.status === "error" ? "text-ink" : "text-muted"}>{it.message}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
