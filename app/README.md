# 1501 Learn

A multi-user Learning Management System for the Data & Analytics Engineering Bootcamp, Next.js (App Router) + TypeScript + Tailwind CSS, backed by Supabase (Postgres, Auth, Storage).

This is **Phase 1 (Foundation)** of the build: project scaffold, database schema + Row-Level Security, authentication, route protection, and the public landing page. See `../.claude` conversation history or ask the team for the full phased roadmap (LMS core, assessment, admin, cohorts, polish).

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

Open your project's **SQL Editor** in the Supabase dashboard and run the three migration files **in order**, pasting each one's contents and clicking Run:

1. `supabase/migrations/0001_init.sql`, tables and indexes
2. `supabase/migrations/0002_rls.sql`, Row-Level Security policies
3. `supabase/migrations/0003_trigger_profiles.sql`, auto-creates a `profiles` row for every new signup

(Once the project is linked with the Supabase CLI, these can instead be applied with `supabase db push`.)

## 4. Seed the real curriculum

This pulls the existing 4-module ShopLink curriculum straight out of the repo-root `index.html` (its `COURSE` array) and loads it as courses/modules/lessons/quizzes/assignments:

```bash
npm install
npm run seed
```

Re-running `npm run seed` is safe, it deletes and re-inserts the course each time.

## 5. Run the app

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). Sign up for an account, it lands you on `/dashboard`. To try the admin area, promote your account in Supabase Studio's table editor: open `profiles`, find your row, and change `role` from `learner` to `admin`.

## Project layout

```
src/
  app/            Next.js App Router pages (public site, learner area, admin area)
  actions/        Server Actions (auth for now)
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
scripts/
  seed.ts         Seeds real curriculum content from ../index.html
```

## Roles & security model

Two roles live in `profiles.role`: `learner` (default) and `admin`. Route access is gated twice:

- `src/proxy.ts` redirects signed-out visitors away from `/dashboard`, `/profile`, `/courses/*`, `/admin/*`, and redirects non-admins away from `/admin/*`. This is a UX convenience, not the security boundary.
- **Row-Level Security in Postgres is the real boundary.** Every table has RLS enabled; see `supabase/migrations/0002_rls.sql` for the full policy set (learners can only read/write their own progress, submissions and attempts; course content is gated by publish status and enrollment; grading fields on submissions are protected from learner tampering by a trigger, not just a policy).
