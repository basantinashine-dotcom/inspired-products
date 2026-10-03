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

-- Storage: each bucket is a row, and each uploaded file is a row in
-- storage.objects. The storage service writes those rows as the signed-in
-- user, so row level security on storage.objects decides who may upload,
-- read and delete.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  metadata jsonb
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects
  to anon, authenticated, service_role;

-- The folders of a path, without the file name: 'a/b/c.jpg' -> {a,b}.
create function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
