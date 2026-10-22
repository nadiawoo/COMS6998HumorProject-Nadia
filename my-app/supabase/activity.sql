-- Week 5 add-on: an activity log, so the admin dashboard can show the most viewed trips,
-- the most popular searches and the most requested destinations.
-- Run once in Supabase → SQL Editor, AFTER admin.sql (it uses public.is_superadmin()).

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- who did it (null for logged-out visitors); keeps the row if the profile is removed
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  -- view   = opened a trip page
  -- search = typed in the home-page search
  -- plan   = typed a destination into "Plan a trip"
  -- lucky  = picked a mood in "Feeling lucky"
  kind text not null check (kind in ('view', 'search', 'plan', 'lucky')),
  route_id uuid references public.routes(id) on delete cascade,
  term text check (char_length(term) <= 80)
);
create index if not exists activity_kind_time on public.activity (kind, created_at desc);

alter table public.activity enable row level security;

-- Anyone using Journey can ADD a row, only as themselves (or anonymously), never read them back
drop policy if exists "activity: log own" on public.activity;
create policy "activity: log own" on public.activity
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Only superadmins can READ the log (no one can update or delete through the API)
drop policy if exists "activity: admin read" on public.activity;
create policy "activity: admin read" on public.activity
  for select to authenticated using (public.is_superadmin());
