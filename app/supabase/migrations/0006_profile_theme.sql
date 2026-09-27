-- Phase 8: explicit per-user light/dark theme preference.
-- Unlike the auto (prefers-color-scheme) dark mode tried and removed earlier,
-- this is a deliberate choice stored on the profile, defaulting to light.

alter table public.profiles
  add column theme text not null default 'light' check (theme in ('light', 'dark'));
