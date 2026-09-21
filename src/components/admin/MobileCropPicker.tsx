"use client";

import { useRef } from "react";
import { MOBILE_RATIO, type Crop } from "@/lib/crop";

// Movable + resizable crop box with a locked tall (phone-shaped) aspect.
// The box shows exactly what the mobile feed will display. Stores a rectangle
// in percent of the original image — no re-export.
export default function MobileCropPicker({
  url,
  imgW,
  imgH,
  value,
  onChange,
}: {
  url: string;
  imgW: number;
  imgH: number;
  value: Crop;
  onChange: (c: Crop) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    crop: Crop;
  } | null>(null);

  // Box height% as a function of width%, so its pixel aspect = MOBILE_RATIO.
  const aspectFactor = imgW / imgH / MOBILE_RATIO;

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, crop: value };
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / r.width) * 100;
    const dy = ((e.clientY - d.startY) / r.height) * 100;

    if (d.mode === "move") {
      const w = d.crop.w;
      const h = d.crop.h;
      onChange({
        x: Math.min(100 - w, Math.max(0, d.crop.x + dx)),
        y: Math.min(100 - h, Math.max(0, d.crop.y + dy)),
        w,
        h,
      });
    } else {
      const { x, y } = d.crop;
      const maxW = Math.min(100 - x, (100 - y) / aspectFactor);
      const w = Math.min(maxW, Math.max(15, d.crop.w + dx));
      onChange({ x, y, w, h: w * aspectFactor });
    }
  }

  function end() {
    drag.current = null;
  }

  return (
    <div>
      <span className="mb-1 block font-mono text-2xs uppercase tracking-[0.12em] text-muted">
        Mobile framing — drag to move, drag corner to resize
      </span>
      <div
        ref={ref}
        className="relative block w-full touch-none select-none overflow-hidden border border-line"
      >
        <img
          src={url}
          alt=""
          draggable={false}
          className="pointer-events-none block h-auto w-full"
        />
        <div
          onPointerDown={(e) => begin("move", e)}
          onPointerMove={move}
          onPointerUp={end}
          className="absolute cursor-move"
          style={{
            left: `${value.x}%`,
            top: `${value.y}%`,
            width: `${value.w}%`,
            height: `${value.h}%`,
            outline: "1px solid #fff",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
          }}
        >
          <div
            onPointerDown={(e) => begin("resize", e)}
            onPointerMove={move}
            onPointerUp={end}
            className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize border border-ink bg-white"
          />
        </div>
      </div>
    </div>
  );
}
