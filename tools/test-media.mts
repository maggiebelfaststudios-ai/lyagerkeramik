// Exercises the import pipeline (src/lib/media) against the real ffmpeg binary
// the site ships (ffmpeg-static) and the real sharp. Every fixture is generated
// here, so nothing needs downloading.
//
//   node tools/test-media.mts          all tests
//   node tools/test-media.mts image    only tests whose name contains "image"
//
// Needs Node 22.18+ (runs TypeScript directly). Takes a few minutes: the
// "too slow" test deliberately runs a slow encode on one thread.
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { optimiseVideo, probe } from "../src/lib/media/video.ts";
import { optimiseImage, blurDataUrl, MAX_STORED_WIDTH } from "../src/lib/media/image.ts";
import { classify } from "../src/lib/media/rules.ts";

const require = createRequire(import.meta.url);
const ffmpeg: string = require("ffmpeg-static");
const sharp: typeof import("sharp") = require("sharp");

const dir = await mkdtemp(join(tmpdir(), "media-test-"));
const only = process.argv[2];
let failed = 0;
let ran = 0;

function make(name: string, args: string[]): string {
  const file = join(dir, name);
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args, file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`fixture ${name}: ${r.stderr}`);
  return file;
}

// Grain-like noise makes a clip expensive to encode, like real footage.
const tall = (d: number, noise = true) =>
  `testsrc2=s=1080x1920:r=30:d=${d}${noise ? ",noise=alls=10:allf=t+u" : ""}`;
const tone = (d: number) => `sine=frequency=440:sample_rate=48000:d=${d}`;
const hush = (d: number) => `anullsrc=r=48000:cl=stereo:d=${d}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// moov (the index) must come before mdat (the data) for playback to start at once.
async function fastStart(file: string): Promise<boolean> {
  const b = await readFile(file);
  return b.indexOf("moov") !== -1 && b.indexOf("moov") < b.indexOf("mdat");
}

async function test(name: string, fn: () => Promise<void>) {
  if (only && !name.includes(only)) return;
  ran++;
  const t = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err instanceof Error ? err.message : err}`);
  }
}

async function video(input: string, extra: Partial<Parameters<typeof optimiseVideo>[0]> = {}) {
  const work = await mkdtemp(join(dir, "work-"));
  return optimiseVideo({ ffmpeg, input, workDir: work, deadline: Date.now() + 270_000, ...extra });
}

async function rejects(p: Promise<unknown>, pattern: RegExp) {
  try {
    await p;
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    assert(pattern.test(m), `wrong error: ${m}`);
    return;
  }
  throw new Error("expected an error, got a result");
}

// ── video ────────────────────────────────────────────────────────────────────
await test("video: high-bitrate export with sound is re-encoded, sound kept", async () => {
  const src = make("loud.mp4", [
    "-f", "lavfi", "-i", tall(3), "-f", "lavfi", "-i", tone(3),
    "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "40M", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "320k",
  ]);
  const r = await video(src);
  assert(r.outcome === "encoded", `outcome ${r.outcome}: ${r.note} / ${r.log.join("; ")}`);
  assert(r.hasAudio, "sound was dropped");
  assert(r.width === 1080 && r.height === 1920, `size ${r.width}×${r.height}`);
  assert(Math.abs(r.duration - 3) < 0.1, `duration ${r.duration}`);
  assert(r.bytes < (await stat(src)).size, "not smaller");
  assert(await fastStart(r.file), "index not at the front");
  const p = await probe(ffmpeg, r.file);
  assert(p.video?.codec === "h264" && p.video.profile === "High", `codec ${p.video?.codec} ${p.video?.profile}`);
  assert(p.audio?.codec === "aac", "no AAC track");
  const poster = await sharp(r.poster).metadata();
  assert(poster.format === "jpeg" && poster.width === 1080 && poster.height === 1920, "bad poster");
});

await test("video: silent soundtrack is dropped", async () => {
  const src = make("hush.mp4", [
    "-f", "lavfi", "-i", tall(2), "-f", "lavfi", "-i", hush(2),
    "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "40M", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-shortest",
  ]);
  const r = await video(src);
  assert(!r.hasAudio, "silent track kept");
  assert(r.note.includes("silent soundtrack removed"), r.note);
  assert((await probe(ffmpeg, r.file)).audio === null, "audio stream still in file");
});

await test("video: no soundtrack at all", async () => {
  const src = make("mute.mp4", [
    "-f", "lavfi", "-i", tall(2), "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "40M", "-pix_fmt", "yuv420p",
  ]);
  const r = await video(src);
  assert(!r.hasAudio && r.outcome === "encoded", `${r.outcome} ${r.hasAudio}`);
});

await test("video: lean export is kept as exported, with fast start", async () => {
  // moov at the end, like many exports; low bitrate, so CRF 18 would be bigger.
  const src = make("lean.mp4", [
    "-f", "lavfi", "-i", tall(3), "-f", "lavfi", "-i", tone(3),
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", "600k", "-pix_fmt", "yuv420p", "-c:a", "aac",
  ]);
  assert(!(await fastStart(src)), "fixture already fast-start");
  const r = await video(src);
  assert(r.outcome === "remuxed", `outcome ${r.outcome}: ${r.note}`);
  assert(r.note.includes("wouldn't save space"), r.note);
  assert(await fastStart(r.file), "index not moved to the front");
  assert(r.hasAudio, "sound dropped");
});

await test("video: HEVC is converted to H.264 even when that's bigger", async () => {
  const src = make("hevc.mp4", [
    "-f", "lavfi", "-i", tall(2), "-c:v", "libx265", "-preset", "ultrafast", "-b:v", "500k",
    "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-x265-params", "log-level=error",
  ]);
  const r = await video(src);
  assert(r.outcome === "encoded", `outcome ${r.outcome}`);
  assert((await probe(ffmpeg, r.file)).video?.codec === "h264", "not H.264");
});

await test("video: 4K is scaled down to 1920×1080", async () => {
  const src = make("uhd.mp4", [
    "-f", "lavfi", "-i", "testsrc2=s=3840x2160:r=30:d=1",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p",
  ]);
  const r = await video(src);
  assert(r.outcome === "encoded" && r.width === 1920 && r.height === 1080, `${r.outcome} ${r.width}×${r.height}`);
});

await test("video: odd-sized 4:4:4 source becomes even 4:2:0", async () => {
  const src = make("odd.mp4", [
    "-f", "lavfi", "-i", "testsrc2=s=1081x1921:r=30:d=1",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv444p",
  ]);
  const r = await video(src);
  const p = await probe(ffmpeg, r.file);
  assert(r.width === 1080 && r.height === 1920, `${r.width}×${r.height}`);
  assert(p.video?.pixFmt === "yuv420p", `pix_fmt ${p.video?.pixFmt}`);
});

await test("video: rotation metadata is honoured on both paths", async () => {
  const flat = make("flat.mp4", [
    "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=2",
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", "500k", "-pix_fmt", "yuv420p",
  ]);
  const rotated = make("rotated.mp4", ["-display_rotation", "90", "-i", flat, "-c", "copy"]);
  const lean = await video(rotated);
  assert(lean.outcome === "remuxed", `lean outcome ${lean.outcome}`);
  assert(lean.width === 1080 && lean.height === 1920, `remuxed ${lean.width}×${lean.height}`);

  const heavyFlat = make("heavyflat.mp4", [
    "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=2,noise=alls=10:allf=t+u",
    "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "40M", "-pix_fmt", "yuv420p",
  ]);
  const heavy = await video(make("heavyrot.mp4", ["-display_rotation", "90", "-i", heavyFlat, "-c", "copy"]));
  assert(heavy.outcome === "encoded", `heavy outcome ${heavy.outcome}`);
  assert(heavy.width === 1080 && heavy.height === 1920, `encoded ${heavy.width}×${heavy.height}`);
  const p = await probe(ffmpeg, heavy.file);
  assert(p.video?.rotation === 0 && p.video.width === 1080, "rotation not applied to pixels");
});

await test("video: PCM soundtrack in a MOV becomes AAC in an MP4", async () => {
  const src = make("pcm.mov", [
    "-f", "lavfi", "-i", tall(2, false), "-f", "lavfi", "-i", tone(2),
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", "500k", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le",
  ]);
  const r = await video(src);
  const p = await probe(ffmpeg, r.file);
  assert(r.hasAudio && p.audio?.codec === "aac", `audio ${p.audio?.codec}`);
});

await test("video: fade-in poster skips the black first frame", async () => {
  const src = make("fade.mp4", [
    "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=3,fade=in:st=0:d=0.5",
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", "600k", "-pix_fmt", "yuv420p",
  ]);
  const r = await video(src);
  const { channels } = await sharp(r.poster).stats();
  assert(channels.slice(0, 3).some((c) => c.mean > 30), "poster is black");
});

await test("video: HDR is refused with a reason", async () => {
  const src = make("hdr.mp4", [
    "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=1",
    "-c:v", "libx265", "-preset", "ultrafast", "-pix_fmt", "yuv420p10le",
    "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc",
    "-x265-params", "log-level=error",
  ]);
  await rejects(video(src), /HDR/);
});

await test("video: truncated file is refused, not crashed on", async () => {
  const whole = await readFile(join(dir, "loud.mp4")).catch(() => null);
  const src = join(dir, "cut.mp4");
  await writeFile(src, (whole ?? Buffer.alloc(4096)).subarray(0, Math.floor((whole?.length ?? 4096) * 0.6)));
  await rejects(video(src), /damaged|couldn't be read/i);
});

await test("video: a file that isn't a video is refused", async () => {
  const src = join(dir, "junk.mp4");
  await writeFile(src, Buffer.from("definitely not a video".repeat(500)));
  await rejects(video(src), /couldn't be read as a video/);
});

await test("video: no time to encode means the H.264 original is kept, fast", async () => {
  const src = make("tight.mp4", [
    "-f", "lavfi", "-i", tall(4), "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "40M", "-pix_fmt", "yuv420p",
  ]);
  const deadline = Date.now() + 12_000;
  const r = await video(src, { deadline });
  assert(r.outcome === "remuxed", `outcome ${r.outcome}`);
  assert(r.note.includes("too long to re-encode"), r.note);
  assert(Date.now() < deadline, "missed the deadline");
});

await test("video: no time to encode a non-H.264 file is a clear error", async () => {
  const src = make("tighthevc.mp4", [
    "-f", "lavfi", "-i", tall(4), "-c:v", "libx265", "-preset", "ultrafast", "-b:v", "8M",
    "-pix_fmt", "yuv420p", "-x265-params", "log-level=error",
  ]);
  const deadline = Date.now() + 12_000;
  await rejects(video(src, { deadline, threads: 1 }), /time limit/);
  assert(Date.now() < deadline + 2000, "overran the deadline");
});

await test("video: an encode that falls behind is stopped early, then the original kept", async () => {
  // One thread, like Vercel. The up-front guess is made to say yes, so the live
  // check has to catch it. 8s of grain at preset slow takes ~50s on one thread.
  const src = make("slowgoing.mp4", [
    "-f", "lavfi", "-i", tall(8), "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "40M", "-pix_fmt", "yuv420p",
  ]);
  const started = Date.now();
  const deadline = started + 30_000;
  const r = await video(src, { deadline, threads: 1, throughput: { slow: 1e6, medium: 1e6 } });
  const log = r.log.join("; ");
  assert(r.outcome === "remuxed", `outcome ${r.outcome}: ${log}`);
  assert(/slow: too slow/.test(log), `not stopped early: ${log}`);
  assert(Date.now() < deadline, "missed the deadline");
});

// ── images ───────────────────────────────────────────────────────────────────
const noise = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 40 } } });

await test("image: wide photo is resized to 3840 as JPEG q100", async () => {
  const src = await noise(6000, 4000).jpeg({ quality: 98, chromaSubsampling: "4:4:4" }).toBuffer();
  const r = await optimiseImage(src);
  assert(r.outcome === "optimised", `${r.outcome}: ${r.note}`);
  assert(r.width === MAX_STORED_WIDTH && r.height === 2560, `${r.width}×${r.height}`);
  const m = await sharp(r.data).metadata();
  assert(m.format === "jpeg" && m.chromaSubsampling === "4:4:4", `${m.format} ${m.chromaSubsampling}`);
});

await test("image: already-efficient photo is kept as uploaded", async () => {
  const src = await noise(2000, 1333).jpeg({ quality: 80 }).toBuffer();
  const r = await optimiseImage(src);
  assert(r.outcome === "original" && r.data === src, r.note);
  assert(r.width === 2000 && r.height === 1333, `${r.width}×${r.height}`);
});

await test("image: EXIF-rotated portrait reports its displayed size (kept)", async () => {
  const src = await noise(3000, 2000).jpeg({ quality: 80 }).withMetadata({ orientation: 6 }).toBuffer();
  const r = await optimiseImage(src);
  assert(r.width === 2000 && r.height === 3000, `${r.width}×${r.height}`);
});

await test("image: EXIF-rotated wide photo is rotated, then resized by width", async () => {
  const src = await sharp({
    create: { width: 8000, height: 5000, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 8 } },
  })
    .jpeg({ quality: 100 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const r = await optimiseImage(src);
  // Displayed 5000×8000 → 3840 wide.
  assert(r.outcome === "optimised" && r.width === 3840 && r.height === 6144, `${r.outcome} ${r.width}×${r.height}`);
  const m = await sharp(r.data).metadata();
  assert(m.width === 3840 && (m.orientation ?? 1) === 1, "pixels not rotated");
});

await test("image: transparency stays PNG", async () => {
  const src = await sharp({ create: { width: 5000, height: 3000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
    .png()
    .toBuffer();
  const r = await optimiseImage(src);
  assert(r.contentType === "image/png", r.contentType);
  assert(r.width === 3840, `${r.width}`);
});

await test("image: TIFF is always converted (browsers can't show it)", async () => {
  const src = await noise(1200, 800).tiff({ compression: "lzw" }).toBuffer();
  const r = await optimiseImage(src);
  assert(r.outcome === "optimised" && r.contentType === "image/jpeg", `${r.outcome} ${r.contentType}`);
});

await test("image: truncated JPEG is refused", async () => {
  const whole = await noise(3000, 2000).jpeg({ quality: 90 }).toBuffer();
  await rejects(optimiseImage(whole.subarray(0, whole.length / 2)), /damaged|couldn't be read/i);
});

await test("image: not an image is refused", async () => {
  await rejects(optimiseImage(Buffer.from("hello".repeat(100))), /couldn't be read as an image/);
});

await test("image: blur placeholder", async () => {
  const b = await blurDataUrl(await noise(400, 300).jpeg().toBuffer());
  assert(b?.startsWith("data:image/jpeg;base64,"), String(b).slice(0, 40));
});

await test("image: a real portfolio photo", async () => {
  const real = "images/original/Giveskud Zoo '26/_MV09767.jpg";
  const src = await readFile(real).catch(() => null);
  if (!src) return console.log("     (skipped, no local photo)");
  const r = await optimiseImage(src);
  console.log(`     ${r.outcome}: ${r.note}`);
  assert(r.outcome === "optimised" && r.width === 3840, `${r.width}`);
});

// ── upload rules ─────────────────────────────────────────────────────────────
await test("rules: what the uploader accepts", async () => {
  const f = (name: string, type: string, size = 1000) => classify({ name, type, size });
  assert("kind" in f("a.JPG", "image/jpeg") && (f("a.JPG", "image/jpeg") as { kind: string }).kind === "image", "jpg");
  assert((f("clip.mp4", "video/mp4") as { kind: string }).kind === "video", "mp4");
  assert((f("clip.MOV", "") as { kind: string }).kind === "video", "mov without type");
  assert("error" in f("x.heic", "image/heic") && /JPEG/.test((f("x.heic", "") as { error: string }).error), "heic");
  assert("error" in f("big.mp4", "video/mp4", 60 * 1024 * 1024), "size limit");
  assert("error" in f("doc.pdf", "application/pdf"), "pdf");
});

await rm(dir, { recursive: true, force: true });
console.log(`\n${ran - failed}/${ran} passed`);
process.exit(failed ? 1 : 0);
