-- Gawain cloud sync.
--
-- The app is local-first: each device keeps everything in its own storage and
-- these tables are a meeting point. Every synced row is a small JSON document
-- (`data`, the app's own shape) plus what sync needs to merge:
--
--   updated_at  when the row was last edited, by the device's clock. Merges are
--               last-write-wins on this, here and on the device.
--   deleted     soft delete, so other devices learn a row is gone.
--   server_at   when this server last stored the row. Devices pull "everything
--               with server_at after the last pull", so an edit made offline
--               last week still reaches them when it finally arrives.
--
-- Shared tables (chores, done_history, items) belong to a household; personal
-- ones (blocks = your weekly meetings, settings = your work hours) belong to a
-- user, because housemates have different calendars. Places (home and store
-- locations) and secret calendar links never leave the device.

-- Households -----------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home' check (length(name) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

-- Security definer so policies on other tables can ask without recursing into
-- household_members' own policy.
create function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

-- The signed-in user's household, made on first call. One per user for now;
-- joining someone else's will add a membership row (an invite flow, later).
-- An RPC rather than a trigger on auth.users so signing up can never fail
-- because of app tables.
create function public.ensure_household()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- One at a time per user, so two devices signing in together get one household.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select m.household_id into hid
  from public.household_members m
  where m.user_id = uid
  order by m.joined_at
  limit 1;
  if hid is null then
    insert into public.households (created_by) values (uid) returning id into hid;
    insert into public.household_members (household_id, user_id, role) values (hid, uid, 'owner');
  end if;
  return hid;
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy "members read their household" on public.households
  for select to authenticated using (public.is_member(id));
create policy "members rename their household" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

create policy "members see who else is in the household" on public.household_members
  for select to authenticated using (public.is_member(household_id));
create policy "members can leave" on public.household_members
  for delete to authenticated using (user_id = (select auth.uid()));
-- No insert policy: memberships are made by ensure_household (and later, invites).

-- Sync rows ------------------------------------------------------------------

-- Stamps server_at and who wrote the row, keeps last-write-wins on the server
-- too (a late push of an older edit doesn't overwrite a newer one), and stops a
-- device with its clock far in the future from winning every merge forever.
create function public.sync_row_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at > now() + interval '5 minutes' then
    new.updated_at := now() + interval '5 minutes';
  end if;
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- older than what's here: skip, the device will pull the newer one
  end if;
  new.server_at := clock_timestamp();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

create table public.chores (
  household_id uuid not null references public.households (id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (household_id, id)
);

-- Each time someone marked a chore done. updated_by is who did it, for
-- who-did-what later.
create table public.done_history (like public.chores including all);
create table public.items (like public.chores including all);

create table public.blocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (length(id) between 1 and 64),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (user_id, id)
);

-- One row per user (id 'settings'): work hours and reminder preferences.
create table public.settings (like public.blocks including all);

-- `like` copies columns, defaults and checks but not foreign keys.
alter table public.done_history
  add foreign key (household_id) references public.households (id) on delete cascade,
  add foreign key (updated_by) references auth.users (id) on delete set null;
alter table public.items
  add foreign key (household_id) references public.households (id) on delete cascade,
  add foreign key (updated_by) references auth.users (id) on delete set null;
alter table public.settings
  add foreign key (user_id) references auth.users (id) on delete cascade,
  add foreign key (updated_by) references auth.users (id) on delete set null;

do $$
declare
  t text;
begin
  foreach t in array array['chores', 'done_history', 'items'] loop
    execute format('create index %1$s_pull_idx on public.%1$I (household_id, server_at)', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "household reads" on public.%I for select to authenticated using (public.is_member(household_id))$p$, t);
    execute format($p$create policy "household adds" on public.%I for insert to authenticated with check (public.is_member(household_id))$p$, t);
    execute format($p$create policy "household edits" on public.%I for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id))$p$, t);
  end loop;
  foreach t in array array['blocks', 'settings'] loop
    execute format('create index %1$s_pull_idx on public.%1$I (user_id, server_at)', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "own rows read" on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "own rows edit" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t);
  end loop;
  foreach t in array array['chores', 'done_history', 'items', 'blocks', 'settings'] loop
    execute format('create trigger stamp before insert or update on public.%I for each row execute function public.sync_row_stamp()', t);
  end loop;
end;
$$;
-- No delete policies on sync tables: rows are soft-deleted so every device hears about it.

-- Grants: signed-in users only, and only what the policies above allow (Supabase
-- grants everything on new tables by default, delete and truncate included).
revoke all on public.households, public.household_members, public.chores, public.done_history, public.items, public.blocks, public.settings from anon, authenticated;
revoke all on function public.is_member(uuid), public.ensure_household(), public.sync_row_stamp() from public, anon, authenticated;
grant select, update on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
grant select, insert, update on public.chores, public.done_history, public.items, public.blocks, public.settings to authenticated;
grant execute on function public.is_member(uuid), public.ensure_household() to authenticated;
