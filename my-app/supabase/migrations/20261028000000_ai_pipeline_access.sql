-- Week 6: the rest of the admin area, on Journey's own database.
-- Run once in Supabase → SQL Editor, AFTER admin.sql and activity.sql.
-- Every table here is used by Journey itself — none are just for show:
--   llm_providers / llm_models    which AI Journey calls
--   prompt_chains / steps / mix   the prompts Journey runs, and how often each trip-writing chain is used
--   terms                         NYC glossary added to the trip-writing prompt
--   generation_examples           sample write-ups added to the prompt for tone
--   generation_requests           one row per "plan a trip" / "feeling lucky" / "how you ride"
--   llm_responses                 every raw AI call inside a request
--   allowed_signup_domains / whitelisted_emails   who may sign in to Journey

-- =============== AI: providers and models ===============
create table if not exists public.llm_providers (
  id bigint generated always as identity primary key,
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),   -- Journey's code knows how to call: google
  api_key_env text,                                          -- NAME of the env var holding the key (never the key)
  docs_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.llm_models (
  id bigint generated always as identity primary key,
  provider_id bigint not null references public.llm_providers(id) on delete restrict,
  name text not null,
  model_key text not null unique,                            -- exact id sent to the API, e.g. gemini-flash-latest
  supports_thinking boolean not null default true,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- =============== AI: prompt chains ===============
create table if not exists public.prompt_chains (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  kind text not null check (kind in ('trip', 'profile')),    -- trip = writes trips; profile = reads "How you ride"
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prompt_chain_steps (
  id bigint generated always as identity primary key,
  chain_id bigint not null references public.prompt_chains(id) on delete cascade,
  step_order int not null,
  role text not null check (role in ('locate', 'write', 'parse')),
  name text not null,
  model_id bigint references public.llm_models(id) on delete set null,   -- null = Journey's default model
  temperature numeric(3,2) not null default 0.7 check (temperature between 0 and 2),
  thinking_level text not null default 'low' check (thinking_level in ('none', 'minimal', 'low')),
  instructions text not null,                                -- {when} is replaced with weekday/weekend
  unique (chain_id, step_order)
);

-- The mix: how often each trip-writing chain is picked for a new trip (weights, not percentages)
create table if not exists public.prompt_chain_mix (
  chain_id bigint primary key references public.prompt_chains(id) on delete cascade,
  weight int not null default 0 check (weight between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

-- =============== AI: prompt ingredients ===============
create table if not exists public.terms (
  id bigint generated always as identity primary key,
  term text not null unique,
  definition text not null,
  category text not null default 'subway' check (category in ('subway', 'neighborhood', 'food', 'slang')),
  include_in_prompts boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_examples (
  id bigint generated always as identity primary key,
  chain_id bigint references public.prompt_chains(id) on delete cascade,  -- null = every trip chain
  title text not null,
  example_text text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =============== AI: what actually happened ===============
create table if not exists public.generation_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  kind text not null check (kind in ('trip', 'lucky', 'profile', 'admin')),
  chain_id bigint references public.prompt_chains(id) on delete set null,
  input jsonb not null default '{}',
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  error text,
  route_id uuid references public.routes(id) on delete set null,
  duration_ms int,
  finished_at timestamptz
);
create index if not exists generation_requests_time on public.generation_requests (created_at desc);

create table if not exists public.llm_responses (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  request_id uuid not null references public.generation_requests(id) on delete cascade,
  step_id bigint references public.prompt_chain_steps(id) on delete set null,
  role text,
  model_key text not null,
  temperature numeric(3,2),
  prompt text not null,
  response text,
  error text,
  duration_ms int
);
create index if not exists llm_responses_request on public.llm_responses (request_id);

-- =============== Access: who may sign in to Journey ===============
create table if not exists public.allowed_signup_domains (
  id bigint generated always as identity primary key,
  domain text not null unique check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.whitelisted_emails (
  id bigint generated always as identity primary key,
  email text not null unique check (email ~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  note text,
  created_at timestamptz not null default now()
);

-- Journey calls this right after Google login. It answers yes/no without revealing either list.
-- Allowed if: both lists are empty, OR the email's domain is allowed, OR the email is whitelisted, OR you're an admin.
create or replace function public.signup_allowed()
returns boolean language sql stable security definer set search_path = public as $$
  with me as (select lower(coalesce(auth.jwt() ->> 'email', '')) as email)
  select
    (not exists (select 1 from public.allowed_signup_domains) and not exists (select 1 from public.whitelisted_emails))
    or exists (select 1 from public.allowed_signup_domains d, me where d.domain = split_part(me.email, '@', 2))
    or exists (select 1 from public.whitelisted_emails w, me where w.email = me.email)
    or public.is_superadmin()
$$;
revoke execute on function public.signup_allowed() from public, anon;
grant execute on function public.signup_allowed() to authenticated;

-- =============== Row Level Security ===============
alter table public.llm_providers        enable row level security;
alter table public.llm_models           enable row level security;
alter table public.prompt_chains        enable row level security;
alter table public.prompt_chain_steps   enable row level security;
alter table public.prompt_chain_mix     enable row level security;
alter table public.terms                enable row level security;
alter table public.generation_examples  enable row level security;
alter table public.generation_requests  enable row level security;
alter table public.llm_responses        enable row level security;
alter table public.allowed_signup_domains enable row level security;
alter table public.whitelisted_emails   enable row level security;

-- Pipeline config: logged-in Journey users READ it (Journey's server needs it to plan your trip;
-- Journey already shows each trip's prompt, so nothing here is secret). Only admins change it.
do $$
declare t text;
begin
  foreach t in array array['llm_providers','llm_models','prompt_chains','prompt_chain_steps','prompt_chain_mix','terms','generation_examples'] loop
    execute format('drop policy if exists "%1$s: read" on public.%1$I', t);
    execute format('create policy "%1$s: read" on public.%1$I for select to authenticated using (true)', t);
  end loop;
  -- full create/update/delete for admins
  foreach t in array array['llm_providers','llm_models','terms','generation_examples'] loop
    execute format('drop policy if exists "%1$s: admin write" on public.%1$I', t);
    execute format('create policy "%1$s: admin write" on public.%1$I for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin())', t);
  end loop;
end $$;
-- the mix: admins may only UPDATE it (rows are created below, one per trip chain)
drop policy if exists "prompt_chain_mix: admin update" on public.prompt_chain_mix;
create policy "prompt_chain_mix: admin update" on public.prompt_chain_mix
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());
-- prompt_chains and prompt_chain_steps: read-only through the API (changed here in SQL)

-- Requests: you log your own; only admins read them
drop policy if exists "generation_requests: log own" on public.generation_requests;
drop policy if exists "generation_requests: finish own" on public.generation_requests;
drop policy if exists "generation_requests: admin read" on public.generation_requests;
create policy "generation_requests: log own" on public.generation_requests
  for insert to authenticated with check (user_id = auth.uid());
create policy "generation_requests: finish own" on public.generation_requests
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "generation_requests: admin read" on public.generation_requests
  for select to authenticated using (public.is_superadmin());
-- the app needs to read back the row it just created (insert ... returning id)
drop policy if exists "generation_requests: read own" on public.generation_requests;
create policy "generation_requests: read own" on public.generation_requests
  for select to authenticated using (user_id = auth.uid());

-- LLM responses: you can add them to your own request; only admins read them
drop policy if exists "llm_responses: log own" on public.llm_responses;
drop policy if exists "llm_responses: admin read" on public.llm_responses;
create policy "llm_responses: log own" on public.llm_responses
  for insert to authenticated
  with check (exists (select 1 from public.generation_requests g where g.id = request_id and g.user_id = auth.uid()));
create policy "llm_responses: admin read" on public.llm_responses
  for select to authenticated using (public.is_superadmin());

-- Access lists: admins only (Journey checks them through signup_allowed())
do $$
declare t text;
begin
  foreach t in array array['allowed_signup_domains','whitelisted_emails'] loop
    execute format('drop policy if exists "%1$s: admin all" on public.%1$I', t);
    execute format('create policy "%1$s: admin all" on public.%1$I for all to authenticated using (public.is_superadmin()) with check (public.is_superadmin())', t);
  end loop;
end $$;

-- Images: admins can list, upload, replace and delete photos in the avatars bucket
drop policy if exists "avatars: admin all" on storage.objects;
create policy "avatars: admin all" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and public.is_superadmin())
  with check (bucket_id = 'avatars' and public.is_superadmin());

-- =============== Starting data (what Journey used before this, now editable) ===============
insert into public.llm_providers (name, slug, api_key_env, docs_url)
values ('Google Gemini', 'google', 'GEMINI_API_KEY', 'https://ai.google.dev/gemini-api/docs/models')
on conflict (slug) do nothing;

insert into public.llm_models (provider_id, name, model_key, supports_thinking, notes)
select p.id, m.name, m.model_key, true, m.notes
from public.llm_providers p,
  (values ('Gemini Flash (latest)', 'gemini-flash-latest', 'Writes trips. Good quality, a little slow on the free tier.'),
          ('Gemini Flash-Lite (latest)', 'gemini-flash-lite-latest', 'Fast and cheap. Finds places and reads riding notes.')) as m(name, model_key, notes)
where p.slug = 'google'
on conflict (model_key) do nothing;

insert into public.prompt_chains (slug, name, kind, description) values
  ('journey-classic', 'Journey classic', 'trip', 'The original Journey voice: a friendly guide for a Columbia student new to NYC.'),
  ('local-friend', 'Local friend', 'trip', 'A born-and-raised New Yorker texting a friend: opinionated, cheap eats first.'),
  ('how-you-ride', 'How you ride', 'profile', 'Turns a rider''s own words into walking/transfer settings and habits.')
on conflict (slug) do nothing;

insert into public.prompt_chain_steps (chain_id, step_order, role, name, model_id, temperature, thinking_level, instructions)
select c.id, s.step_order, s.role, s.name, (select id from public.llm_models where model_key = s.model_key), s.temperature, s.thinking, s.instructions
from public.prompt_chains c
join (values
  ('journey-classic', 1, 'locate', 'Find the places', 'gemini-flash-lite-latest', 0.0, 'minimal',
   'For each place in New York City below, give its latitude and longitude and a short clean name. If a place is vague (e.g. "Midtown"), use its most typical central point. If it is not in NYC, set found=false.'),
  ('journey-classic', 2, 'write', 'Pick a route and write the trip', 'gemini-flash-latest', 0.8, 'low',
   'You are the voice of "Journey", a guide for a Columbia student who is new to NYC and explores on {when}s.'),
  ('local-friend', 1, 'locate', 'Find the places', 'gemini-flash-lite-latest', 0.0, 'minimal',
   'For each place in New York City below, give its latitude and longitude and a short clean name. If a place is vague (e.g. "Midtown"), use its most typical central point. If it is not in NYC, set found=false.'),
  ('local-friend', 2, 'write', 'Pick a route and write the trip', 'gemini-flash-latest', 0.9, 'low',
   'You grew up in New York and you are texting a Columbia friend who just moved here and explores on {when}s. Be specific and a little opinionated. Favor cheap eats, long-running local spots and the blocks locals actually walk, over famous tourist stops.'),
  ('how-you-ride', 1, 'parse', 'Read the rider''s notes', 'gemini-flash-lite-latest', 0.0, 'minimal',
   'A NYC subway rider described how they like to get around. Turn it into settings.')
) as s(chain_slug, step_order, role, name, model_key, temperature, thinking, instructions) on s.chain_slug = c.slug
on conflict (chain_id, step_order) do nothing;

insert into public.prompt_chain_mix (chain_id, weight)
select id, case slug when 'journey-classic' then 70 else 30 end from public.prompt_chains where kind = 'trip'
on conflict (chain_id) do nothing;

insert into public.terms (term, definition, category) values
  ('Uptown / Downtown', 'In Manhattan, trains are signed by direction: uptown = north, downtown = south.', 'subway'),
  ('Local / Express', 'Locals stop everywhere; expresses skip stops. The 1 is local, the 2 and 3 run express below 96 St.', 'subway'),
  ('Cross-platform transfer', 'Changing trains by walking across the same platform, e.g. 1 to 2/3 at 96 St or 72 St.', 'subway'),
  ('OMNY', 'The tap-to-pay fare system; tap a card or phone at the turnstile. MetroCards are being phased out.', 'subway'),
  ('Free transfer', 'One free transfer within 2 hours, including subway to bus.', 'subway'),
  ('Elevated (el)', 'Track above the street, e.g. the 7 in Queens or the J over Broadway in Brooklyn — the best views.', 'subway'),
  ('Bodega', 'A corner store; often has a cat and a hot sandwich counter (try a chopped cheese).', 'food'),
  ('Dollar slice', 'A cheap plain slice of pizza; usually more than a dollar now.', 'food'),
  ('Halal cart', 'Street cart serving chicken or lamb over rice with white and hot sauce.', 'food'),
  ('Morningside Heights', 'The neighborhood around Columbia, from about 110 St to 125 St.', 'neighborhood'),
  ('The outer boroughs', 'Brooklyn, Queens, the Bronx and Staten Island — everything that isn''t Manhattan.', 'neighborhood')
on conflict (term) do nothing;

insert into public.generation_examples (chain_id, title, example_text)
select null, 'Tone: short, specific, friendly',
  'Hook: Bridge views, dumplings, and a waterfront nap — all for one fare.
Stop: DUMBO — "Get the classic shot on Washington St, then walk it off."
  - Time Out Market rooftop — free skyline view from the top floor; grab a drink or just look.
  - Brooklyn Bridge Park Pier 1 — lie on the lawn facing lower Manhattan; best around golden hour.
  - Juliana''s — the clam pie if you''re splurging; the line is shortest right at opening.'
where not exists (select 1 from public.generation_examples);

-- Signup rules start OPEN (both lists empty = anyone with Google can sign in), so graders aren't locked out.
-- To limit Journey to students, add columbia.edu and barnard.edu in the admin area under "Signup domains".
