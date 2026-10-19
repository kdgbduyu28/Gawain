-- is_member is only for row policies, so take it out of the API: functions in
-- public can be called by anyone signed in at /rest/v1/rpc. Policies point at
-- the function itself, not its name, so they keep working after the move.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter function public.is_member(uuid) set schema private;
