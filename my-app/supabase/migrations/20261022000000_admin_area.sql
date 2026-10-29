-- Week 5: Admin area — run once in Supabase → SQL Editor (same project as Journey).
-- Adds a superadmin flag and gives superadmins (and only them) wider access.
-- Everything else in Journey's security rules stays as it was.

-- 1) The flag -------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;

-- 2) Nobody can make themselves an admin through the app -------------------------
-- Journey lets you update your own profile row, which would include this column.
-- This trigger blocks any change to it that comes from a logged-in (or anonymous)
-- app user. The SQL Editor runs as the project owner (no app login), so it still works.
create or replace function public.protect_superadmin()
returns trigger language plpgsql as $$
begin
  if new.is_superadmin is distinct from (case when tg_op = 'INSERT' then false else old.is_superadmin end)
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    raise exception 'is_superadmin can only be changed by the project owner';
  end if;
  return new;
end $$;

drop trigger if exists protect_superadmin on public.profiles;
create trigger protect_superadmin before insert or update on public.profiles
  for each row execute function public.protect_superadmin();

-- 3) "Am I an admin?" ------------------------------------------------------------
-- security definer = reads profiles with the owner's rights, so policies on profiles
-- can call it without looping back into themselves.
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin from public.profiles where id = auth.uid()), false)
$$;
revoke execute on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated;

-- 4) Admin-only policies (added next to Journey's "own row" policies) ------------
-- profiles: READ all
drop policy if exists "profiles: admin read all" on public.profiles;
create policy "profiles: admin read all" on public.profiles
  for select to authenticated using (public.is_superadmin());

-- votes: READ all
drop policy if exists "votes: admin read all" on public.votes;
create policy "votes: admin read all" on public.votes
  for select to authenticated using (public.is_superadmin());

-- routes (the AI-generated trips): everyone can already read; logged-in users can
-- already create their own. Admins may also UPDATE and DELETE any trip.
drop policy if exists "routes: admin update" on public.routes;
drop policy if exists "routes: admin delete" on public.routes;
create policy "routes: admin update" on public.routes
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
create policy "routes: admin delete" on public.routes
  for delete to authenticated using (public.is_superadmin());

-- 5) Emails and sign-in dates live in auth.users, which the API can't read.
-- This function hands them to admins only.
create or replace function public.admin_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_superadmin() then
    raise exception 'admins only';
  end if;
  return query select u.id, u.email::text, u.created_at, u.last_sign_in_at from auth.users u;
end $$;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;

-- 6) Making yourself an admin is a one-time manual step, NOT part of this migration
-- (it names a specific person). Run this once in the SQL Editor with your own email:
--   update public.profiles set is_superadmin = true
--   where id = (select id from auth.users where email = 'you@gmail.com');
