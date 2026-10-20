-- Meal planner, shared by the household.
--
-- One table of small JSON rows, synced like chores. Row ids say what each is:
--
--   profile        the questionnaire answers (household size, budget, diets...)
--   plan           this week's plan, dishes and shopping list
--   cook:<slot>    a planned dish that's been cooked
--   link:<slot>    a planned dish added to Chores ({"chore": <chore id>})
--   stock:<id>     an ingredient in the kitchen from plan shopping ({"qty", "at"})
--
-- Separate rows for cooked dishes and kitchen stock, so two people ticking off
-- groceries or cooking on different phones both count. Prices stay on each
-- device (they're re-read from Presyo).

create table public.meals (like public.chores including all);

alter table public.meals
  add foreign key (household_id) references public.households (id) on delete cascade,
  add foreign key (updated_by) references auth.users (id) on delete set null;

create index meals_pull_idx on public.meals (household_id, server_at);
alter table public.meals enable row level security;
create policy "household reads" on public.meals for select to authenticated using (private.is_member(household_id));
create policy "household adds" on public.meals for insert to authenticated with check (private.is_member(household_id));
create policy "household edits" on public.meals for update to authenticated using (private.is_member(household_id)) with check (private.is_member(household_id));
create trigger stamp before insert or update on public.meals for each row execute function public.sync_row_stamp();

-- A plan is the biggest row the app syncs (about 20 kB); keep anything far past that out.
alter table public.meals add constraint meals_data_size check (pg_column_size(data) < 200000);

revoke all on public.meals from anon, authenticated;
grant select, insert, update on public.meals to authenticated;
