import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "ymnueiihmblbcxufaqsv.supabase.co";

const nextConfig: NextConfig = {
  // The import route runs the ffmpeg binary from ffmpeg-static. Load the package
  // from node_modules at runtime (bundling would break its path), and ship the
  // binary with that route's function. npm downloads the right one for the
  // platform at install time: ffmpeg.exe locally, a Linux build on Vercel.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/admin/import": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // AVIF first — better quality per byte than WebP for photographs.
    formats: ["image/avif", "image/webp"],
    // Include 2K–4K so full-bleed photos stay sharp on Retina / 4K displays
    // instead of upscaling a 1920px version.
    deviceSizes: [390, 640, 828, 1080, 1200, 1920, 2048, 2560, 3840],
    imageSizes: [120, 200, 256, 384],
  },
};

export default nextConfig;
