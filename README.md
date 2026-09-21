# Keramik af Gitte Lyager

Portfolio site for Gitte Lyager's ceramics. A copy of the Simon L. Samuelsen
photography site with its own Supabase project, GitHub repository and Vercel
project. Next.js (App Router) + Supabase, styled with Tailwind: a curated main
page, a file-manager gallery, and a private admin for upload and curation.

## Stack

- **Next.js** (App Router, TypeScript)
- **Supabase** — Postgres, Auth (email/password), Storage (bucket `Photos`)
- **Tailwind CSS**
- **exifr** — EXIF parsing, server-side on upload
- **pnpm**

## Prerequisites

- **Node.js ≥ 18.18** (Node 20 LTS recommended) — _not currently installed on this
  machine_. Install from <https://nodejs.org> or `winget install OpenJS.NodeJS.LTS`.
- **pnpm** — after Node is installed: `corepack enable && corepack prepare pnpm@latest --activate`

## Environment variables

`.env.local` is already filled in with the existing Supabase project. For deployment
or a fresh checkout, copy `.env.example` → `.env.local` and set:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable / anon key (browser-safe) |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | Storage bucket name (`Photos`) |

No service-role key is needed: all writes happen under the signed-in admin's session,
enforced by Row Level Security.

## Database setup

Run the migration once against the Supabase project. Either paste
`supabase/migrations/0001_init.sql` into the **Supabase SQL editor** and run it, or
use the CLI:

```bash
supabase db execute --file supabase/migrations/0001_init.sql
```

It creates the `photos` and `folders` tables, indexes, RLS policies (public read,
authenticated write), and the storage policies for the `Photos` bucket.

Then confirm the bucket is public: **Storage → Photos → Settings → "Public bucket"**.
The bucket itself already exists — do not recreate it.

## Create the admin user

Only one user needs credentials. In the Supabase dashboard:

**Authentication → Users → Add user** → enter email + password → create.
**Then turn off public sign-ups** (Authentication → Sign In / Providers → "Allow new
users to sign up"). Every signed-in account can edit the site, so an open sign-up
would let anyone in.

Visiting `/admin` while signed out redirects to `/admin/login`.

## Run locally

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. The admin is at <http://localhost:3000/admin>.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add the three environment variables above in **Project → Settings → Environment
   Variables**.
4. Deploy. Image optimization runs on Vercel; the Supabase storage hostname is already
   allow-listed in `next.config.ts` (it reads it from `NEXT_PUBLIC_SUPABASE_URL`).

## How it works

- **Main page (`/`)** — one column of photos, ordered by the manually curated
  `main_page_order`. Photos only; no captions.
- **Gallery (`/gallery`)** — folders (series/places/periods) in a file-manager view,
  in the manual `display_order`. Open a folder for a thumbnail grid; open a photo for
  the full image plus EXIF metadata.
- **Info (`/info`)** — intentionally blank for now.
- **Admin (`/admin`)** — four tabs:
  - **Upload** — drag-drop / bulk. A blur placeholder and dimensions are computed in
    the browser; EXIF is read server-side with `exifr`; the file goes to the `Photos`
    bucket and a row is inserted.
  - **Main page** — toggle photos on/off and drag to set their order.
  - **Folders** — create / rename / describe / reorder / delete; set a cover photo.
  - **Photos** — edit description, override any EXIF field, assign a folder, or delete
    (which also removes the file from storage).

## Notes

- The repo-root `images/` folder holds the original JPGs and is not used by the app.
- No tests, no Storybook — plain code by design.
