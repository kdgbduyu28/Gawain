-- Smart home: hubs and gadgets (Home Assistant, an iPhone Shortcut on an NFC
-- tag, anything that can send a web request) tell Gawain that something
-- happened, e.g. "washer finished" or "trash button pressed".
--
--   triggers     what each named trigger does in the app ("trash" marks Take out
--                the trash done, "washer" runs the washer timer). Synced like
--                chores, so every device in the household knows them.
--   home_hooks   one secret link per household. Only a hash of its token is kept.
--   home_events  what arrived through the link. Devices pull these and apply
--                them, so the app's own rules (due dates, reminders after
--                meetings) decide what happens, exactly as if tapped.
--
-- Events come in through post_home_event, which anyone holding the token can
-- call without signing in (the website's /api/home/<token> forwards to it).

-- Triggers -------------------------------------------------------------------

create table public.triggers (like public.chores including all);

alter table public.triggers
  add foreign key (household_id) references public.households (id) on delete cascade,
  add foreign key (updated_by) references auth.users (id) on delete set null;

create index triggers_pull_idx on public.triggers (household_id, server_at);
alter table public.triggers enable row level security;
create policy "household reads" on public.triggers for select to authenticated using (private.is_member(household_id));
create policy "household adds" on public.triggers for insert to authenticated with check (private.is_member(household_id));
create policy "household edits" on public.triggers for update to authenticated using (private.is_member(household_id)) with check (private.is_member(household_id));
create trigger stamp before insert or update on public.triggers for each row execute function public.sync_row_stamp();

revoke all on public.triggers from anon, authenticated;
grant select, insert, update on public.triggers to authenticated;

-- The household's secret link --------------------------------------------------

create table public.home_hooks (
  household_id uuid primary key references public.households (id) on delete cascade,
  token_hash bytea not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Only reached through the functions below.
alter table public.home_hooks enable row level security;
revoke all on public.home_hooks from anon, authenticated;

-- Makes a new link for the caller's household and returns its token, the only
-- time it's ever readable. Any older link stops working.
create function public.new_home_hook()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := public.ensure_household();
  -- Two random UUIDs: 244 random bits, from Postgres' strong random source.
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.home_hooks (household_id, token_hash, created_by)
  values (hid, sha256(convert_to(token, 'UTF8')), (select auth.uid()))
  on conflict (household_id) do update
    set token_hash = excluded.token_hash, created_by = excluded.created_by, created_at = now();
  return token;
end;
$$;

-- When the household's link was made, or null if it has none.
create function public.home_hook_made_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select h.created_at from public.home_hooks h
  where private.is_member(h.household_id)
  order by h.created_at desc
  limit 1;
$$;

create function public.remove_home_hook()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.home_hooks h where private.is_member(h.household_id);
$$;

-- Events ---------------------------------------------------------------------

create table public.home_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  trigger_key text not null check (trigger_key ~ '^[a-z0-9][a-z0-9_-]{0,47}$'),
  event text not null default '' check (length(event) <= 32),
  at timestamptz not null default now()
);

create index home_events_household_idx on public.home_events (household_id, id);
alter table public.home_events enable row level security;
create policy "household reads" on public.home_events for select to authenticated using (private.is_member(household_id));
revoke all on public.home_events from anon, authenticated;
grant select on public.home_events to authenticated;

-- 'ok', or why the event was turned away: 'unknown-link', 'bad-trigger', 'too-many'.
create function public.post_home_event(hook_token text, trigger_key text, event text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
  k text := lower(trim(coalesce(trigger_key, '')));
  e text := lower(trim(coalesce(event, '')));
begin
  if hook_token is null or hook_token !~ '^[0-9a-f]{64}$' then
    return 'unknown-link';
  end if;
  select h.household_id into hid from public.home_hooks h where h.token_hash = sha256(convert_to(hook_token, 'UTF8'));
  if hid is null then
    return 'unknown-link';
  end if;
  if k !~ '^[a-z0-9][a-z0-9_-]{0,47}$' or length(e) > 32 then
    return 'bad-trigger';
  end if;
  -- A stuck automation shouldn't be able to fill the table.
  if (select count(*) from public.home_events x where x.household_id = hid and x.at > now() - interval '1 hour') >= 120 then
    return 'too-many';
  end if;
  -- Devices apply events within minutes; keep two weeks for the setup screen's log.
  delete from public.home_events x where x.household_id = hid and x.at < now() - interval '14 days';
  insert into public.home_events (household_id, trigger_key, event) values (hid, k, e);
  return 'ok';
end;
$$;

revoke all on function public.new_home_hook(), public.home_hook_made_at(), public.remove_home_hook(), public.post_home_event(text, text, text) from public, anon, authenticated;
grant execute on function public.new_home_hook(), public.home_hook_made_at(), public.remove_home_hook() to authenticated;
grant execute on function public.post_home_event(text, text, text) to anon, authenticated;

-- Open apps hear about new events right away instead of on the next pull.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.home_events;
  end if;
end;
$$;
