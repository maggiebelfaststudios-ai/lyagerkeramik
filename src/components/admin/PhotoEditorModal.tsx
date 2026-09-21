"use client";

import { useState } from "react";
import { publicUrl, stillPath } from "@/lib/images";
import { updatePhotoMeta, deletePhoto } from "@/app/admin/actions";
import MobileCropPicker from "./MobileCropPicker";
import { resolveCrop, type Crop } from "@/lib/crop";
import type { Photo } from "@/lib/types";

function toInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

function fromInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-2xs uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-line bg-paper px-2 py-1 outline-none focus:border-ink"
      />
    </label>
  );
}

// Per-photo editor: description, EXIF overrides, mobile framing, delete.
// Membership/folder are handled by dragging, so they're not here.
export default function PhotoEditorModal({
  photo,
  onClose,
  onChanged,
}: {
  photo: Photo;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [description, setDescription] = useState(photo.description ?? "");
  const [captured, setCaptured] = useState(toInput(photo.captured_at));
  const [shutter, setShutter] = useState(photo.shutter_speed ?? "");
  const [aperture, setAperture] = useState(photo.aperture ?? "");
  const [focal, setFocal] = useState(photo.focal_length ?? "");
  const [iso, setIso] = useState(photo.iso != null ? String(photo.iso) : "");
  const [camera, setCamera] = useState(photo.camera ?? "");
  const [lens, setLens] = useState(photo.lens ?? "");
  const [crop, setCrop] = useState<Crop>(() =>
    resolveCrop(
      {
        x: photo.mobile_crop_x,
        y: photo.mobile_crop_y,
        w: photo.mobile_crop_w,
        h: photo.mobile_crop_h,
      },
      photo.width ?? 1500,
      photo.height ?? 1000,
    ),
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await updatePhotoMeta(photo.id, {
      description: description.trim() || null,
      captured_at: fromInput(captured),
      shutter_speed: shutter.trim() || null,
      aperture: aperture.trim() || null,
      focal_length: focal.trim() || null,
      iso: iso.trim() ? Number(iso) : null,
      camera: camera.trim() || null,
      lens: lens.trim() || null,
      mobile_crop_x: crop.x,
      mobile_crop_y: crop.y,
      mobile_crop_w: crop.w,
      mobile_crop_h: crop.h,
    });
    onChanged();
    onClose();
  }

  async function remove() {
    const what = photo.media_type === "video" ? "video" : "photo";
    if (!confirm(`Delete this ${what}? This also removes the file from storage.`))
      return;
    setSaving(true);
    await deletePhoto(photo.id);
    onChanged();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-5xl border border-ink bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="truncate font-mono text-2xs uppercase tracking-[0.15em] text-ink">
            {photo.filename}
          </span>
          <button
            onClick={onClose}
            className="font-mono text-2xs uppercase tracking-[0.12em] text-muted hover:text-ink"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 p-4 md:grid-cols-2">
          <MobileCropPicker
            url={publicUrl(stillPath(photo))}
            imgW={photo.width ?? 1500}
            imgH={photo.height ?? 1000}
            value={crop}
            onChange={setCrop}
          />

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block font-mono text-2xs uppercase tracking-[0.12em] text-muted">
                Description
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border border-line bg-paper px-2 py-1 outline-none focus:border-ink"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Captured"
                type="datetime-local"
                value={captured}
                onChange={setCaptured}
              />
              <Field label="ISO" type="number" value={iso} onChange={setIso} />
              <Field label="Shutter" value={shutter} onChange={setShutter} />
              <Field label="Aperture" value={aperture} onChange={setAperture} />
              <Field label="Focal" value={focal} onChange={setFocal} />
              <Field label="Camera" value={camera} onChange={setCamera} />
            </div>
            <Field label="Lens" value={lens} onChange={setLens} />

            <div className="flex justify-between pt-1">
              <button
                onClick={remove}
                disabled={saving}
                className="font-mono text-2xs uppercase tracking-[0.12em] text-muted hover:text-ink disabled:opacity-50"
              >
                Delete
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="border border-ink bg-ink px-4 py-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-paper hover:opacity-85 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
