-- Week 4: Scenic Route — run once in Supabase → SQL Editor
-- Creates routes + votes, adds riding preferences to profiles, and turns on strict RLS everywhere.

-- 1) Riding preferences on profiles -------------------------------------------
alter table public.profiles
  add column if not exists max_walk_minutes int not null default 15 check (max_walk_minutes between 0 and 30),
  add column if not exists transfer_style text not null default 'any' check (transfer_style in ('any','same_station','none')),
  add column if not exists avoid_transfers text[] not null default '{}';

-- 2) AI-generated routes ------------------------------------------------------
create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  destination text not null,
  vibe text,
  prompt text not null,        -- exact prompt sent to the AI
  model text not null,         -- which AI model generated it
  card jsonb not null,         -- the AI's answer (title, hook, legs, tips)
  facts jsonb not null,        -- computed from MTA data (time, above-ground stops, bridges, transfers)
  prefs_used jsonb not null    -- the creator's preferences at generation time
);

-- 3) Votes: intent = Would ride / Pass, experience = took it: recommend / don't --
create table if not exists public.votes (
  route_id uuid not null references public.routes(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('intent','experience')),
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (route_id, user_id, kind)   -- one vote of each kind per person per route
);

-- 4) Public vote totals ----------------------------------------------------------
-- Visitors may see totals but NOT who voted. This view runs with its owner's rights
-- (security_invoker = false), so it can count all votes while the votes table stays private.
create or replace view public.route_scores with (security_invoker = false) as
select r.id as route_id, r.created_at,
  count(*) filter (where v.kind = 'intent' and v.value = 1)::int      as want,
  count(*) filter (where v.kind = 'intent' and v.value = -1)::int     as pass,
  count(*) filter (where v.kind = 'experience' and v.value = 1)::int  as rode_yes,
  count(*) filter (where v.kind = 'experience' and v.value = -1)::int as rode_no,
  -- people who actually took a route count double
  (coalesce(sum(v.value) filter (where v.kind = 'intent'), 0)
   + 2 * coalesce(sum(v.value) filter (where v.kind = 'experience'), 0))::int as score
from public.routes r left join public.votes v on v.route_id = r.id
group by r.id;
grant select on public.route_scores to anon, authenticated;

-- 5) Row Level Security: ON for every table, strictest rules that keep the app working
alter table public.profiles enable row level security;
alter table public.routes   enable row level security;
alter table public.votes    enable row level security;
alter table if exists public.main_table enable row level security;  -- old cats table: no policies = nobody can read it via the API

-- profiles: only you can see/change your own row (the signup trigger runs as owner, so it still works)
drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- routes: anyone can read (public Trending/Top feed); only logged-in users create, as themselves; no edits/deletes
drop policy if exists "routes: public read" on public.routes;
drop policy if exists "routes: create own" on public.routes;
create policy "routes: public read" on public.routes for select to anon, authenticated using (true);
create policy "routes: create own"  on public.routes for insert to authenticated with check (created_by = auth.uid());

-- votes: you only see, add, change and remove your own
drop policy if exists "votes: read own" on public.votes;
drop policy if exists "votes: insert own" on public.votes;
drop policy if exists "votes: update own" on public.votes;
drop policy if exists "votes: delete own" on public.votes;
create policy "votes: read own"   on public.votes for select to authenticated using (user_id = auth.uid());
create policy "votes: insert own" on public.votes for insert to authenticated with check (user_id = auth.uid());
create policy "votes: update own" on public.votes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "votes: delete own" on public.votes for delete to authenticated using (user_id = auth.uid());

-- 6) Storage: tighten avatars back to "only your own folder" (public bucket → anyone can still view photos by URL)
drop policy if exists "avatars bucket access" on storage.objects;
drop policy if exists "avatars access" on storage.objects;
drop policy if exists "avatars: own folder" on storage.objects;
create policy "avatars: own folder" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 7) (added later) free-text riding habits + AI-extracted traits on profiles
alter table public.profiles
  add column if not exists ride_notes text,
  add column if not exists traits jsonb not null default '{}';
