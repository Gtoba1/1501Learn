# 1501 Learn

A multi-user Learning Management System for the self-paced Analytics Engineering Bootcamp, Next.js (App Router) + TypeScript + Tailwind CSS, backed by Supabase (Postgres, Auth, Storage).

There are two tracks, **Analytics Engineering** and **Data Engineering**, each a 10-module course. Learners choose one track on their dashboard after signing up and can switch later; progress in each track is kept. Each lesson has content, a resource library (videos, reading, docs), a practice task with a self-check example answer, and optional peer review. Each module ends with a quiz (which must be passed to complete the module) and a project graded by an admin.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**.
2. Pick an organization, name it (e.g. `shoplink-lms`), choose a region close to your learners, and set a database password, save that password somewhere safe (a password manager), it's separate from your Supabase login.
3. Wait for provisioning to finish (a minute or two).
4. Open **Project Settings → API**. You'll need:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret, server-only, never in the browser)

## 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in the three values from step 1. `.env.local` is git-ignored, never commit it.

## 3. Apply the database schema

Open your project's **SQL Editor** in the Supabase dashboard and run every file in `supabase/migrations/` **in order** (`0001` to `0009`), pasting each one's contents and clicking Run:

1. `0001_init.sql`, tables and indexes
2. `0002_rls.sql`, Row-Level Security policies
3. `0003_trigger_profiles.sql`, auto-creates a `profiles` row for every new signup
4. `0004` to `0007`, role guards, self-serve enrolment, themes and security hardening
5. `0008_curriculum_v2.sql`, lesson resources, practice tasks and peer review
6. `0009_tracks.sql`, the track picker (no auto-enrollment at signup; `choose_track` switches tracks)

(Once the project is linked with the Supabase CLI, these can instead be applied with `supabase db push`.)

## 4. Seed the curriculum

Each track lives in its own folder: `content/<course-slug>/_course.md` holds the course details and `content/<course-slug>/NN-*.md` holds one file per module. The format is documented at the top of `scripts/seed.ts`.

```bash
npm install
npm run content:check   # parse and validate the module files, no database access
npm run seed            # rebuild the course in Supabase
```

`npm run seed` syncs rather than rebuilds: it updates courses, modules, lessons, quizzes and projects in place (matching lessons by slug), so learners keep their progress, quiz passes, practice answers and submissions. Only modules and lessons removed from the files are deleted. Content edited in the admin area for a seeded lesson is overwritten on the next sync, so make lasting changes in the markdown files.

## 5. Practice dataset

Learners download the ShopLink practice data from `/datasets/shoplink.zip` and `/datasets/shoplink-batch-2.zip` (served from `public/datasets/`). The zips are generated deterministically by:

```bash
npm run data
```

## 6. Run the app

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). Sign up for an account, it lands you on `/dashboard`. To try the admin area, promote your account in Supabase Studio's table editor: open `profiles`, find your row, and change `role` from `learner` to `admin`.

## Project layout

```
src/
  app/            Next.js App Router pages (public site, learner area, admin area)
  actions/        Server Actions
  components/     UI kit + feature components
  lib/supabase/   Browser + server Supabase clients
  lib/data/       Server-side data-fetching helpers
  lib/validations/  Zod schemas
  lib/types/database.types.ts   Hand-written to match the SQL migrations , 
    regenerate from the live schema once the project is linked:
    supabase gen types typescript --linked > src/lib/types/database.types.ts
  proxy.ts        Route protection (Next.js 16's replacement for middleware.ts)
supabase/
  migrations/     SQL migrations, apply in order
content/
  analytics-engineering/   One markdown file per module, plus _course.md
  data-engineering/        The same, for the Data Engineering track
scripts/
  seed.ts                     Loads content/modules into Supabase
  generate-shoplink-data.ts   Builds the ShopLink practice dataset zips
```

## Roles & security model

Two roles live in `profiles.role`: `learner` (default) and `admin`. Route access is gated twice:

- `src/proxy.ts` redirects signed-out visitors away from `/dashboard`, `/profile`, `/courses/*`, `/admin/*`, and redirects non-admins away from `/admin/*`. This is a UX convenience, not the security boundary.
- **Row-Level Security in Postgres is the real boundary.** Every table has RLS enabled; see `supabase/migrations/0002_rls.sql` for the full policy set (learners can only read/write their own progress, submissions and attempts; course content is gated by publish status and enrollment; grading fields on submissions are protected from learner tampering by a trigger, not just a policy).
