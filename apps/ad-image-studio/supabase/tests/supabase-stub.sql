-- The few pieces of Supabase the migrations rely on, so the database tests can
-- run on a plain local Postgres without Docker. A real Supabase project
-- already has all of this; never run this file against one.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);

-- The same lookup Supabase uses: the user id is the "sub" claim of the
-- sign-in token the request arrived with.
create function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
