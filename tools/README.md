# Media import

Photos and videos uploaded in the admin go through three steps:

1. The browser uploads the original to `incoming/` in Supabase Storage.
2. It calls `POST /admin/import` (`src/app/admin/import/route.ts`).
3. That route optimises the file, stores the result, adds the database row and
   deletes the original. It streams progress back to the uploader.

The optimising happens on the server, not in the browser as in Kolofon, because
the quality has to be the same whichever computer and browser the upload comes
from.

## Limits

| | Limit | Why |
| --- | --- | --- |
| Any file | 50 MB | Supabase Free's per-file cap. The original has to reach Storage before the server can touch it. |
| Video processing | ~270 s | Vercel Hobby stops a function at 300 s. The last 30 s are kept for saving. |

In practice, a 1080×1920 Premiere export hits the 50 MB limit at:
- about 20 s at 20 Mbps;
- about 40 s at 10 Mbps.

A clip too long to re-encode in time is still accepted if it's H.264. It's kept
exactly as exported, see below.

## Photos (`src/lib/media/image.ts`, sharp)

- Resized to at most **3840 px wide**, the widest size the site ever serves.
  Width, not long edge, because Next/Image picks sizes by width.
- Saved as **JPEG q100, 4:4:4**. Every visitor gets Next's AVIF made from this
  file. Tested on the portfolio's grainiest photos, q100 serves identically to
  the original, while q95 visibly lost grain at 4K. WebP was ruled out because
  it always halves colour resolution (4:2:0).
- **Kept exactly as uploaded** unless the new file is at least 10% smaller.
  Across the current 29 photos: 219 MB → 146 MB.
- EXIF (camera, shutter, …) is read from the original before anything else. The
  stored copy has metadata stripped, GPS included.
- HEIC is refused. TIFF is always converted, since browsers can't show it. A
  file sharp can't decode is refused, because Next/Image couldn't serve it
  either.

## Videos (`src/lib/media/video.ts`, ffmpeg from `ffmpeg-static`)

- **H.264 CRF 18**, High profile, yuv420p, fast start, capped at 1920×1080 with
  no upscaling. CRF 18 is x264's visually-lossless point. Kolofon's 23 is not
  used here.
- **Preset slow**, dropping to **medium** when slow can't finish in time. Same
  quality, a slightly bigger file. A live check stops an encode that is falling
  behind early, instead of at the deadline.
- **Sound** is copied untouched if it's AAC, otherwise converted to AAC 256k.
  A soundtrack that is pure silence (Premiere adds one) is removed, so no sound
  button appears for it.
- The result must be H.264 at the planned size, within 0.75 s of the original's
  length, and decode cleanly end to end.
- **Kept as exported** when re-encoding wouldn't save at least 10%, or couldn't
  finish in time, provided the original is 8-bit H.264. The picture is copied
  untouched; only the index is moved to the front so playback starts at once.
- HDR is refused: export SDR (Rec. 709) from Premiere. A non-H.264 file that
  can't be converted in time is refused with a reason.
- A poster frame (the first frame, or a later one if the first is black) is
  stored as `<id>.poster.jpg`. It is the placeholder before playback and the
  thumbnail in the gallery and admin.

The uploader prints each video's details (encode speed, preset, attempts) in the
browser console. Use them to retune `OPTIMISTIC_MPPS` in `video.ts` if Vercel
turns out faster or slower than assumed.

## Tests

```
npm run test:media            all (a few minutes)
npm run test:media -- video   only tests with "video" in the name
```

Runs the real ffmpeg binary and the real sharp against generated clips and
images:
- sound, silence, no sound;
- lean and heavy exports;
- HEVC, 4K, odd sizes, rotation;
- PCM-in-MOV, fade-ins, HDR;
- truncated files and junk;
- tight deadlines, including an encode stopped early for falling behind.
