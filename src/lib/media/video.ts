// Server-side video optimisation (ffmpeg). Runs in the import route, after the
// original has been uploaded to Storage. Settings follow Kolofon's
// tools/optimise-video.mjs, with two changes made for this site: CRF 18 instead
// of 23, and the soundtrack is kept.
//
// Every path ends in a file that plays everywhere, or in a clear error:
// - encoded:  H.264 at CRF 18, verified, and clearly smaller than the original;
// - remuxed:  the original video stream, untouched, with the index moved to the
//             front. Used when re-encoding wouldn't save space or couldn't
//             finish in time, provided the original is H.264 already.
//
// No imports besides Node and sharp, so tools/test-media.mts can load this file
// directly.
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

// ── settings ─────────────────────────────────────────────────────────────────
// CRF 18 is x264's "visually lossless" point (ffmpeg's H.264 guide). Kolofon
// uses 23. That is visibly softer on fine detail, so it is not used here.
const CRF = 18;
// Tried in order. At the same CRF a faster preset gives the same picture in a
// slightly bigger file, so falling back costs bytes, not quality.
const PRESETS = ["slow", "medium"] as const;
type Preset = (typeof PRESETS)[number];
// Long edge / short edge ceiling. Never upscaled.
const BOX_LONG = 1920;
const BOX_SHORT = 1080;
// A re-encode must come back this close to the original's length.
const DURATION_TOLERANCE = 0.75;
// Below this saving the original stream is kept; not worth a generation.
const MIN_SAVING = 0.1;
// Peak level at or under which a soundtrack counts as silence. Premiere adds
// a silent track to sequences with no audio. Real sound, even room tone, peaks
// far above this.
const SILENCE_DB = -70;
// For soundtracks that aren't AAC already (AAC is copied untouched).
const AUDIO_BITRATE = "256k";
// Optimistic encode throughput on Vercel's single vCPU, in megapixels of video
// per second. Measured locally on a clean 1080×1920 clip, scaled down for a
// slower server core. These only stop an encode that can't possibly finish from
// starting. The live check in encode() catches the rest.
const OPTIMISTIC_MPPS: Record<Preset, number> = { slow: 14.7, medium: 24 };
// Measured locally: medium ran 1.65× faster than slow on the same clip.
const MEDIUM_VS_SLOW = 1.65;
// Conservative decode speed for the verification pass, frames per second.
const VERIFY_FPS = 40;

// ── probing ──────────────────────────────────────────────────────────────────
export interface VideoStream {
  index: number;
  codec: string;
  profile: string | null;
  pixFmt: string;
  colour: string; // e.g. "tv, bt709, progressive"
  width: number; // as stored
  height: number;
  fps: number | null;
  rotation: number;
}

export interface Probe {
  duration: number | null;
  video: VideoStream | null;
  audio: { index: number; codec: string } | null;
}

// Split on commas that aren't inside brackets.
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Parses the stream summary `ffmpeg -i` prints. ffmpeg-static pins the ffmpeg
// version, so the format is the same locally and on Vercel.
export function parseProbe(text: string): Probe {
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null;
  let video: VideoStream | null = null;
  let audio: Probe["audio"] = null;
  let inVideo = false;

  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*Stream #0:(\d+)[^:]*: (\w+): (.*)$/.exec(line);
    if (m) {
      inVideo = false;
      const [, index, type, rest] = m;
      if (type === "Video" && !video && !rest.includes("(attached pic)")) {
        const parts = splitTop(rest);
        const head = parts[0] ?? "";
        const firstParen = /^\S+ \(([^)]+)\)/.exec(head)?.[1] ?? null;
        const dims = parts.map((p) => /^(\d+)x(\d+)/.exec(p)).find(Boolean);
        const fps =
          parts.map((p) => /^([\d.]+) fps$/.exec(p)).find(Boolean) ??
          parts.map((p) => /^([\d.]+) tbr$/.exec(p)).find(Boolean);
        video = {
          index: Number(index),
          codec: head.split(/\s/)[0],
          // "(avc1 / 0x31637661)" is a codec tag, not a profile.
          profile: firstParen && !firstParen.includes(" / 0x") ? firstParen : null,
          pixFmt: (parts[1] ?? "").split("(")[0].trim(),
          colour: /\((.*)\)/.exec(parts[1] ?? "")?.[1] ?? "",
          width: dims ? Number(dims[1]) : 0,
          height: dims ? Number(dims[2]) : 0,
          fps: fps ? Number(fps[1]) : null,
          rotation: 0,
        };
        inVideo = true;
      } else if (type === "Audio" && !audio) {
        audio = { index: Number(index), codec: rest.split(/[\s,]/)[0] };
      }
      continue;
    }
    const r = inVideo && video ? /rotation of (-?[\d.]+) degrees/.exec(line) : null;
    if (r && video) video.rotation = Math.round(Number(r[1]));
  }

  return { duration, video, audio };
}

// ── running ffmpeg ───────────────────────────────────────────────────────────
interface RunResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
  killed: string | null; // why we stopped it, if we did
}

interface RunOptions {
  deadline?: number; // epoch ms: kill at this point
  onStdoutLine?: (line: string) => void; // stream stdout as text lines
  control?: { stop?: (why: string) => void }; // lets the caller kill early
}

function run(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    let pending = "";
    let killed: string | null = null;

    const stop = (why: string) => {
      if (killed) return;
      killed = why;
      child.kill("SIGKILL");
    };
    if (opts.control) opts.control.stop = stop;
    const timer =
      opts.deadline !== undefined
        ? setTimeout(() => stop("deadline"), Math.max(0, opts.deadline - Date.now()))
        : null;

    child.stdout.on("data", (chunk: Buffer) => {
      if (!opts.onStdoutLine) {
        out.push(chunk);
        return;
      }
      pending += chunk.toString("utf8");
      let nl: number;
      while ((nl = pending.indexOf("\n")) !== -1) {
        opts.onStdoutLine(pending.slice(0, nl).trim());
        pending = pending.slice(nl + 1);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < 200_000) err += chunk.toString("utf8");
    });
    child.on("error", (e) => {
      err += `\n${e.message}`;
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: err, killed });
    });
  });
}

export async function probe(ffmpeg: string, file: string): Promise<Probe> {
  // Exits non-zero ("no output file"), but prints the summary first.
  const r = await run(ffmpeg, ["-hide_banner", "-nostdin", "-i", file]);
  return parseProbe(r.stderr);
}

async function peakVolume(ffmpeg: string, file: string, index: number): Promise<number | null> {
  const r = await run(ffmpeg, [
    "-hide_banner", "-nostdin", "-i", file,
    "-map", `0:${index}`, "-af", "volumedetect", "-f", "null", "-",
  ]);
  const m = /max_volume: (-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) return null;
  return m[1] === "-inf" ? -Infinity : Number(m[1]);
}

// ── plan ─────────────────────────────────────────────────────────────────────
const even = (n: number) => Math.max(2, 2 * Math.floor(n / 2));

// Fit inside 1920×1080 (or 1080×1920), never upscaling, even dimensions.
export function fitBox(w: number, h: number): { width: number; height: number } {
  const [bw, bh] = w >= h ? [BOX_LONG, BOX_SHORT] : [BOX_SHORT, BOX_LONG];
  const f = Math.min(1, bw / w, bh / h);
  return { width: even(w * f), height: even(h * f) };
}

// 8-bit 4:2:0 H.264 plays in every browser. Anything else must be converted.
function playsEverywhere(v: VideoStream): boolean {
  return (
    v.codec === "h264" &&
    /^yuvj?420p$/.test(v.pixFmt) &&
    !/High 10|4:2:2|4:4:4/.test(v.profile ?? "")
  );
}

// The matrix a browser would use, for turning a frame into an RGB poster.
function colourMatrix(colour: string, height: number): string {
  if (colour.includes("bt709")) return "bt709";
  if (/bt470bg|smpte170m|bt601/.test(colour)) return "bt601";
  return height >= 720 ? "bt709" : "bt601";
}

interface Plan {
  input: string;
  threads?: number;
  videoIndex: number;
  audio: { index: number; codec: string } | null; // null: dropped
  width: number; // output, as displayed
  height: number;
  scale: boolean;
}

function audioArgs(plan: Plan): string[] {
  if (!plan.audio) return ["-an"];
  return plan.audio.codec === "aac" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", AUDIO_BITRATE];
}

function maps(plan: Plan): string[] {
  return [
    "-map", `0:${plan.videoIndex}`,
    ...(plan.audio ? ["-map", `0:${plan.audio.index}`] : []),
  ];
}

// ── encode ───────────────────────────────────────────────────────────────────
type EncodeResult =
  | { ok: true; seconds: number }
  | { ok: false; reason: "too slow" | "deadline" | "failed"; detail: string; projectedMs?: number };

async function encode(
  ffmpeg: string,
  plan: Plan,
  output: string,
  preset: Preset,
  duration: number,
  deadline: number,
  onRatio: (r: number) => void,
): Promise<EncodeResult> {
  const started = Date.now();
  const control: { stop?: (why: string) => void } = {};
  let outTime = 0;
  let firstOutputAt = 0;
  let projectedMs: number | undefined;
  const samples: Array<[number, number]> = []; // [wall ms, output seconds]

  const r = await run(
    ffmpeg,
    [
      "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
      "-i", plan.input,
      ...maps(plan),
      ...(plan.scale ? ["-vf", `scale=${plan.width}:${plan.height}:flags=lanczos`] : []),
      "-c:v", "libx264", "-preset", preset, "-crf", String(CRF),
      "-profile:v", "high", "-pix_fmt", "yuv420p",
      ...(plan.threads ? ["-threads", String(plan.threads)] : []),
      ...audioArgs(plan),
      "-map_metadata", "-1",
      "-movflags", "+faststart",
      "-progress", "pipe:1", "-stats_period", "0.5",
      output,
    ],
    {
      deadline,
      control,
      onStdoutLine(line) {
        const t = /^out_time_us=(\d+)$/.exec(line);
        if (t) outTime = Number(t[1]) / 1e6;
        if (!line.startsWith("progress=") || outTime <= 0) return;

        const now = Date.now();
        onRatio(Math.min(1, outTime / duration));
        if (!firstOutputAt) firstOutputAt = now;
        samples.push([now, outTime]);
        while (samples.length > 2 && now - samples[0][0] > 6000) samples.shift();

        // Once the rate has settled, stop an encode that can't finish in time,
        // rather than finding out at the deadline.
        if (now - firstOutputAt < 4000) return;
        const [w0, t0] = samples[0];
        const rate = (outTime - t0) / ((now - w0) / 1000); // video s per wall s
        if (rate <= 0) return;
        const finish = now + ((duration - outTime) / rate) * 1000;
        if (finish > deadline) {
          projectedMs = finish - started;
          control.stop?.("too slow");
        }
      },
    },
  );

  if (r.killed === "too slow") {
    return { ok: false, reason: "too slow", detail: `${preset} would miss the time limit`, projectedMs };
  }
  if (r.killed) return { ok: false, reason: "deadline", detail: `${preset} hit the time limit` };
  if (r.code !== 0) {
    return { ok: false, reason: "failed", detail: r.stderr.trim().split("\n").slice(-3).join(" ") };
  }
  return { ok: true, seconds: (Date.now() - started) / 1000 };
}

// The file must be H.264, the planned size, the right length, and decode
// cleanly from start to finish.
async function verify(
  ffmpeg: string,
  file: string,
  plan: Plan,
  duration: number,
  fullDecode: boolean,
  deadline: number,
): Promise<string | null> {
  const p = await probe(ffmpeg, file);
  if (!p.video || p.video.codec !== "h264") return "output isn't H.264";
  const swap = Math.abs(p.video.rotation) % 180 === 90;
  const w = swap ? p.video.height : p.video.width;
  const h = swap ? p.video.width : p.video.height;
  if (w !== plan.width || h !== plan.height) return `output is ${w}×${h}, expected ${plan.width}×${plan.height}`;
  if (p.duration === null || Math.abs(p.duration - duration) > DURATION_TOLERANCE) {
    return `output runs ${p.duration?.toFixed(2) ?? "?"}s, original ${duration.toFixed(2)}s`;
  }
  if (!fullDecode) return null;
  const d = await run(
    ffmpeg,
    ["-hide_banner", "-nostdin", "-v", "error", "-i", file, "-map", "0:v:0", "-f", "null", "-"],
    { deadline },
  );
  if (d.killed) return "no time left to check the output";
  if (d.code !== 0 || d.stderr.trim()) return `output doesn't decode cleanly: ${d.stderr.trim().slice(0, 200)}`;
  return null;
}

async function grabFrame(ffmpeg: string, file: string, at: number, matrix: string): Promise<Buffer> {
  const r = await run(ffmpeg, [
    "-hide_banner", "-nostdin", "-v", "error",
    "-ss", String(at), "-i", file,
    "-frames:v", "1", "-vf", `scale=in_color_matrix=${matrix}`,
    "-f", "image2pipe", "-c:v", "png", "pipe:1",
  ]);
  return r.stdout;
}

async function nearBlack(png: Buffer): Promise<boolean> {
  const { channels } = await sharp(png).stats();
  return channels.slice(0, 3).every((c) => c.mean < 12);
}

// The first frame, so the poster matches what playback starts on, unless it's
// black (a fade in). Then a frame a moment later, so thumbnails aren't blank.
async function makePoster(ffmpeg: string, file: string, duration: number, matrix: string): Promise<Buffer> {
  let png = await grabFrame(ffmpeg, file, 0, matrix);
  if (!png.length) throw new Error("Couldn't take a still from the video.");
  if (duration > 0.5 && (await nearBlack(png))) {
    const later = await grabFrame(ffmpeg, file, Math.min(1, duration / 2), matrix);
    if (later.length && !(await nearBlack(later))) png = later;
  }
  // Same treatment as a stored photo: an intermediate for Next/Image.
  return sharp(png).jpeg({ quality: 100, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
}

// ── main ─────────────────────────────────────────────────────────────────────
export interface VideoResult {
  outcome: "encoded" | "remuxed";
  file: string; // MP4 to store
  bytes: number;
  poster: Buffer; // JPEG
  width: number; // as displayed
  height: number;
  duration: number;
  hasAudio: boolean;
  note: string; // one line for the admin
  log: string[]; // details, for the browser console
}

export interface VideoOptions {
  ffmpeg: string;
  input: string;
  workDir: string;
  deadline: number; // epoch ms by which this must return
  onProgress?: (stage: "analyse" | "encode" | "verify", ratio?: number) => void;
  // Tests only: emulate Vercel's single core, and override the up-front
  // throughput guess so the live "too slow" check can be exercised.
  threads?: number;
  throughput?: Partial<Record<Preset, number>>;
}

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export async function optimiseVideo(o: VideoOptions): Promise<VideoResult> {
  const log: string[] = [];
  const progress = o.onProgress ?? (() => {});
  progress("analyse");

  const inputBytes = (await stat(o.input)).size;
  const src = await probe(o.ffmpeg, o.input);
  const v = src.video;
  if (!v || !v.width || !v.height) {
    throw new Error("This file couldn't be read as a video. It may be damaged, or not finished exporting.");
  }
  if (!src.duration || src.duration <= 0) {
    throw new Error("Couldn't read how long this video is. The file may be damaged.");
  }
  if (/smpte2084|arib-std-b67/.test(v.colour)) {
    throw new Error("This video is HDR. Export it from Premiere as SDR (Rec. 709) H.264 and upload that.");
  }
  const duration = src.duration;

  // Keep the soundtrack only if there's something in it.
  let audio = src.audio;
  if (audio) {
    const peak = await peakVolume(o.ffmpeg, o.input, audio.index);
    if (peak !== null && peak <= SILENCE_DB) {
      log.push(`soundtrack is silent (peak ${peak} dB), dropped`);
      audio = null;
    }
  }

  const swap = Math.abs(v.rotation) % 180 === 90;
  const shownW = swap ? v.height : v.width;
  const shownH = swap ? v.width : v.height;
  const target = fitBox(shownW, shownH);
  const plan: Plan = {
    input: o.input,
    threads: o.threads,
    videoIndex: v.index,
    audio,
    width: target.width,
    height: target.height,
    scale: target.width !== shownW || target.height !== shownH,
  };
  const universal = playsEverywhere(v);
  log.push(
    `source ${v.codec}${v.profile ? ` ${v.profile}` : ""} ${v.pixFmt} ${shownW}×${shownH} ` +
      `${v.fps ?? "?"}fps ${duration.toFixed(2)}s ${mb(inputBytes)}, audio ${src.audio?.codec ?? "none"}`,
  );

  // Time budget: leave room to verify the result and take the poster.
  const frames = duration * (v.fps ?? 30);
  const megapixels = ((plan.width * plan.height) / 1e6) * frames;
  const encodeDeadline = o.deadline - ((frames / VERIFY_FPS) * 1000 + 8000);
  const mpps = { ...OPTIMISTIC_MPPS, ...o.throughput };
  const fits = (p: Preset) => Date.now() + (megapixels / mpps[p]) * 1000 <= encodeDeadline;
  let presets: Preset[] = PRESETS.filter(fits);
  // If the original won't play everywhere there's nothing to fall back on, so
  // try anyway.
  if (!presets.length && !universal) presets = ["medium"];
  if (!presets.length) log.push("too long to re-encode within the time limit");

  const encoded = join(o.workDir, "encoded.mp4");
  let chosen: { preset: Preset; seconds: number; bytes: number } | null = null;
  for (let i = 0; i < presets.length; i++) {
    const preset = presets[i];
    progress("encode", 0);
    const r = await encode(o.ffmpeg, plan, encoded, preset, duration, encodeDeadline, (x) =>
      progress("encode", x),
    );
    if (r.ok) {
      progress("verify");
      const problem = await verify(o.ffmpeg, encoded, plan, duration, true, o.deadline - 5000);
      if (problem) {
        log.push(`${preset}: ${problem}`);
        break;
      }
      chosen = { preset, seconds: r.seconds, bytes: (await stat(encoded)).size };
      log.push(`${preset}: ${r.seconds.toFixed(1)}s, ${(frames / r.seconds).toFixed(1)} fps, ${mb(chosen.bytes)}`);
      break;
    }
    log.push(`${preset}: ${r.reason} (${r.detail})`);
    if (r.reason === "failed") break;
    // Only move on to medium if it can plausibly finish in what's left.
    const next = presets[i + 1];
    if (next && r.projectedMs !== undefined && Date.now() + r.projectedMs / MEDIUM_VS_SLOW > encodeDeadline) {
      log.push(`${next}: skipped, would miss the time limit too`);
      break;
    }
  }

  const useEncoded =
    chosen !== null && (!universal || plan.scale || chosen.bytes <= inputBytes * (1 - MIN_SAVING));

  let file: string;
  let outcome: VideoResult["outcome"];
  let note: string;
  const matrix = colourMatrix(v.colour, plan.height);

  if (useEncoded && chosen) {
    file = encoded;
    outcome = "encoded";
    note = `H.264 CRF ${CRF} (${chosen.preset}) · ${mb(inputBytes)} → ${mb(chosen.bytes)}`;
  } else {
    if (!universal) {
      throw new Error(
        `This video is ${v.codec}${/10/.test(v.pixFmt) ? " 10-bit" : ""}, which doesn't play in every browser, ` +
          "and it couldn't be converted within the server's time limit. " +
          "Export it from Premiere as H.264 (MP4), or shorten it, and upload again.",
      );
    }
    // The original picture, untouched: stream copy, index moved to the front.
    file = join(o.workDir, "remuxed.mp4");
    const remuxPlan: Plan = { ...plan, width: shownW, height: shownH, scale: false };
    const r = await run(
      o.ffmpeg,
      [
        "-hide_banner", "-nostdin", "-y", "-loglevel", "error",
        "-i", o.input, ...maps(remuxPlan), "-c:v", "copy", ...audioArgs(remuxPlan),
        "-map_metadata", "-1", "-movflags", "+faststart", file,
      ],
      { deadline: o.deadline },
    );
    const problem =
      r.code !== 0 || r.killed
        ? `couldn't rewrite the file: ${r.stderr.trim().slice(0, 200)}`
        : await verify(o.ffmpeg, file, remuxPlan, duration, false, o.deadline);
    if (problem) throw new Error(`Couldn't prepare this video (${problem}).`);
    plan.width = shownW;
    plan.height = shownH;
    outcome = "remuxed";
    const reason =
      chosen === null
        ? presets.length
          ? "re-encoding couldn't finish in time"
          : "too long to re-encode in time"
        : "re-encoding wouldn't save space";
    note = `kept as exported (${reason}) · ${mb(inputBytes)} → ${mb((await stat(file)).size)}`;
  }

  const bytes = (await stat(file)).size;
  const poster = await makePoster(o.ffmpeg, file, duration, matrix);
  if (!audio && src.audio) note += " · silent soundtrack removed";

  return {
    outcome,
    file,
    bytes,
    poster,
    width: plan.width,
    height: plan.height,
    duration,
    hasAudio: audio !== null,
    note,
    log,
  };
}
