// Media import. The browser uploads the original to `incoming/` in Storage, then
// calls this route. It optimises the file, stores the result, records the row,
// and deletes the original, streaming progress back as NDJSON.
//
// A route handler rather than a Server Action: the browser runs Server Actions
// one at a time, so a video taking minutes here would hold up every other
// admin action behind it.
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/images";
import { parseExif } from "@/lib/exif";
import { MAX_UPLOAD_BYTES, extensionOf, type MediaKind } from "@/lib/media/rules";
import { optimiseImage, blurDataUrl } from "@/lib/media/image";
import { optimiseVideo } from "@/lib/media/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby's ceiling. Everything below is budgeted against it.
export const maxDuration = 300;

const BUDGET_MS = maxDuration * 1000;
// Kept free after optimising: uploading the result and writing the row.
const SAVE_RESERVE_MS = 30_000;
// Stored files never change (new uploads get new names), so cache for a year.
const CACHE = "31536000";
const INCOMING = /^incoming\/([0-9a-f-]{36})\.[a-z0-9]{1,5}$/;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Send = (msg: Record<string, unknown>) => void;

export async function POST(request: Request) {
  const started = Date.now();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Signed out. Reload the page and sign in.", { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    path?: unknown;
    filename?: unknown;
    kind?: unknown;
  } | null;
  const path = typeof body?.path === "string" ? body.path : "";
  const match = INCOMING.exec(path);
  const kind = body?.kind === "image" || body?.kind === "video" ? (body.kind as MediaKind) : null;
  if (!match || !kind) return new Response("Bad request", { status: 400 });
  const filename = typeof body?.filename === "string" ? body.filename.slice(0, 255) : null;

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let open = true;
  const send: Send = (msg) => {
    if (!open) return;
    writer.write(encoder.encode(`${JSON.stringify(msg)}\n`)).catch(() => {
      open = false; // the browser went away; the import carries on regardless
    });
  };

  const job = importMedia(supabase, { path, id: match[1], kind, filename, started, send })
    .then(
      (result) => send({ type: "done", ...result }),
      (err) => send({ type: "error", message: err instanceof Error ? err.message : "Import failed" }),
    )
    .finally(() => {
      if (open) writer.close().catch(() => {});
    });
  // Keep the function alive until the import finishes, even if the tab closes.
  after(job);

  return new Response(readable, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

interface Job {
  path: string;
  id: string;
  kind: MediaKind;
  filename: string | null;
  started: number;
  send: Send;
}

async function importMedia(supabase: Supabase, job: Job) {
  const work = await mkdtemp(join(tmpdir(), "import-"));
  try {
    job.send({ type: "progress", stage: "download" });
    const { data, error } = await supabase.storage.from(BUCKET).download(job.path);
    if (error || !data) throw new Error(`Couldn't read the upload back: ${error?.message ?? "not found"}`);
    const input = Buffer.from(await data.arrayBuffer());
    if (input.length > MAX_UPLOAD_BYTES) throw new Error("File is over the 50 MB limit.");

    return job.kind === "image"
      ? await importImage(supabase, job, input)
      : await importVideo(supabase, job, input, work);
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
    // The original is on the uploader's computer; don't leave a copy behind.
    // (Already gone if it was moved into place.)
    await supabase.storage.from(BUCKET).remove([job.path]).catch(() => {});
    await sweepIncoming(supabase);
  }
}

async function importImage(supabase: Supabase, job: Job, input: Buffer) {
  job.send({ type: "progress", stage: "optimise" });
  // EXIF from the original: the stored copy has it stripped.
  const [exif, img] = await Promise.all([parseExif(input), optimiseImage(input)]);

  let storagePath: string;
  if (img.outcome === "original") {
    storagePath = `${job.id}.${extensionOf(job.path)}`;
    const { error } = await supabase.storage.from(BUCKET).move(job.path, storagePath);
    if (error) throw new Error(`Couldn't store the photo: ${error.message}`);
  } else {
    storagePath = `${job.id}.${img.ext}`;
    await upload(supabase, storagePath, img.data, img.contentType);
  }

  job.send({ type: "progress", stage: "save" });
  await insertRow(supabase, [storagePath], {
    storage_path: storagePath,
    filename: job.filename,
    blur_placeholder: await blurDataUrl(img.data),
    width: img.width,
    height: img.height,
    captured_at: exif.captured_at,
    shutter_speed: exif.shutter_speed,
    aperture: exif.aperture,
    focal_length: exif.focal_length,
    iso: exif.iso,
    camera: exif.camera,
    lens: exif.lens,
  });
  return { note: img.note, log: [] };
}

async function importVideo(supabase: Supabase, job: Job, input: Buffer, work: string) {
  if (!ffmpegPath) throw new Error("Video processing isn't available on this server.");
  const source = join(work, `source.${extensionOf(job.path)}`);
  await writeFile(source, input);

  const v = await optimiseVideo({
    ffmpeg: ffmpegPath,
    input: source,
    workDir: work,
    deadline: job.started + BUDGET_MS - SAVE_RESERVE_MS,
    onProgress: (stage, ratio) => job.send({ type: "progress", stage, ratio }),
  });

  job.send({ type: "progress", stage: "save" });
  const storagePath = `${job.id}.mp4`;
  const posterPath = `${job.id}.poster.jpg`;
  await upload(supabase, storagePath, await readFile(v.file), "video/mp4");
  try {
    await upload(supabase, posterPath, v.poster, "image/jpeg");
  } catch (err) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw err;
  }

  await insertRow(supabase, [storagePath, posterPath], {
    storage_path: storagePath,
    poster_path: posterPath,
    media_type: "video",
    filename: job.filename,
    blur_placeholder: await blurDataUrl(v.poster),
    width: v.width,
    height: v.height,
    duration: v.duration,
    has_audio: v.hasAudio,
  });
  return { note: v.note, log: v.log };
}

async function upload(supabase: Supabase, path: string, data: Buffer, contentType: string) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, data, { contentType, cacheControl: CACHE, upsert: false });
  if (error) throw new Error(`Couldn't store the file: ${error.message}`);
}

async function insertRow(supabase: Supabase, stored: string[], row: Record<string, unknown>) {
  const { error } = await supabase.from("photos").insert(row);
  if (error) {
    await supabase.storage.from(BUCKET).remove(stored);
    if (/media_type|poster_path|has_audio|duration/.test(error.message)) {
      throw new Error(
        "The database isn't set up for video yet. Run supabase/migrations/0006_video.sql in the Supabase SQL editor.",
      );
    }
    throw new Error(`Couldn't save: ${error.message}`);
  }
  revalidatePath("/", "layout");
}

// Remove originals left behind by imports that never finished (a crash, or a
// tab closed mid-upload). Best effort; an hour is far longer than any import.
async function sweepIncoming(supabase: Supabase) {
  const { data } = await supabase.storage.from(BUCKET).list("incoming", { limit: 100 });
  const cutoff = Date.now() - 60 * 60 * 1000;
  const stale = (data ?? [])
    .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
    .map((f) => `incoming/${f.name}`);
  if (stale.length) await supabase.storage.from(BUCKET).remove(stale);
}
