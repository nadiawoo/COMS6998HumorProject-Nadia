-- Safety check: fails the push loudly if any table the apps need is missing.
do $$
declare t text; missing text[] := '{}';
begin
  foreach t in array array['profiles','routes','votes','activity','llm_providers','llm_models','prompt_chains','prompt_chain_steps',
                           'prompt_chain_mix','terms','generation_examples','generation_requests','llm_responses',
                           'allowed_signup_domains','whitelisted_emails'] loop
    if to_regclass('public.' || t) is null then missing := missing || t; end if;
  end loop;
  if array_length(missing, 1) > 0 then raise exception 'Missing tables: %', array_to_string(missing, ', '); end if;
  if not exists (select 1 from pg_proc where proname = 'is_superadmin') then raise exception 'Missing function is_superadmin()'; end if;
  if not exists (select 1 from pg_proc where proname = 'signup_allowed') then raise exception 'Missing function signup_allowed()'; end if;
end $$;
