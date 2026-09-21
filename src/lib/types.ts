// Domain types, shared across server and client.

export interface Photo {
  id: string;
  storage_path: string;
  filename: string | null;
  width: number | null;
  height: number | null;
  blur_placeholder: string | null;
  captured_at: string | null;
  uploaded_at: string;
  shutter_speed: string | null;
  aperture: string | null;
  focal_length: string | null;
  iso: number | null;
  camera: string | null;
  lens: string | null;
  description: string | null;
  folder_id: string | null;
  on_main_page: boolean;
  main_page_order: number | null;
  on_mobile: boolean;
  mobile_order: number | null;
  mobile_crop_x: number | null;
  mobile_crop_y: number | null;
  mobile_crop_w: number | null;
  mobile_crop_h: number | null;
  // Videos share this table. For a video, storage_path is the MP4 and
  // poster_path its still frame (used as the placeholder and thumbnail).
  media_type: "image" | "video";
  poster_path: string | null;
  duration: number | null; // seconds
  has_audio: boolean; // a real soundtrack (silent tracks are removed on import)
}

export interface Folder {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_photo_id: string | null;
  display_order: number;
  created_at: string;
}

// Editable subset of EXIF/metadata used by the admin edit form.
export interface PhotoMetadata {
  captured_at: string | null;
  shutter_speed: string | null;
  aperture: string | null;
  focal_length: string | null;
  iso: number | null;
  camera: string | null;
  lens: string | null;
  description: string | null;
  mobile_crop_x: number | null;
  mobile_crop_y: number | null;
  mobile_crop_w: number | null;
  mobile_crop_h: number | null;
}

// Minimal Database typing for the typed Supabase client.
export interface Database {
  public: {
    Tables: {
      photos: {
        Row: Photo;
        Insert: Partial<Photo> & Pick<Photo, "storage_path">;
        Update: Partial<Photo>;
      };
      folders: {
        Row: Folder;
        Insert: Partial<Folder> & Pick<Folder, "name" | "slug">;
        Update: Partial<Folder>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
