-- Step 1: projects, and the rule that each advertiser sees only their own.
--
-- The browser talks to this database directly with a key that is public by
-- design. So the database itself has to refuse everything the signed-in user
-- is not allowed to do. Two layers do that:
--
--   1. Grants decide which roles may touch the table at all. Signed-out
--      visitors (anon) get nothing.
--   2. Row level security decides which rows a signed-in user (authenticated)
--      may see or change: only rows whose owner_id is their own user id.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  -- Filled in from the signed-in user, so the page never sends an owner.
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null
    check (char_length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every policy below filters on owner_id, so every query does too.
create index projects_owner_id_idx on public.projects (owner_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Layer 1: grants.
revoke all on public.projects from anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;

-- Layer 2: row level security. With it on and no policy matching, a query
-- sees no rows and a write is refused.
alter table public.projects enable row level security;

-- (select auth.uid()) rather than auth.uid(): Postgres then works out the
-- user id once per query instead of once per row.
create policy "owners read their projects"
  on public.projects for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy "owners create their projects"
  on public.projects for insert to authenticated
  with check ((select auth.uid()) = owner_id);

-- using: which rows you may change. with check: what they may become, so a
-- project cannot be handed to another advertiser. Postgres would reuse
-- `using` if `with check` were left out; writing it keeps the rule visible.
create policy "owners update their projects"
  on public.projects for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "owners delete their projects"
  on public.projects for delete to authenticated
  using ((select auth.uid()) = owner_id);
