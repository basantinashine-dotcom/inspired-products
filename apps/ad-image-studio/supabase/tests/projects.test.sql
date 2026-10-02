-- Each advertiser sees and changes only their own projects.
--
-- Runs inside one transaction and rolls back, so it leaves nothing behind.
-- It plays two advertisers, Ana and Ben, by switching to the role the browser
-- uses (authenticated) and setting the user id the way a sign-in token would.

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@example.com');

-- Ana is signed in.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

insert into public.projects (name) values ('Ana water bottle');

do $$
begin
  assert (select count(*) from public.projects) = 1,
    'Ana should see her one project';
  assert (select owner_id from public.projects)
    = '00000000-0000-0000-0000-0000000000a1',
    'owner_id should be filled in with the signed-in user';
end $$;
\echo 'ok - a new project belongs to whoever created it'

do $$
begin
  insert into public.projects (name, owner_id)
    values ('Planted', '00000000-0000-0000-0000-0000000000b2');
  raise exception 'Ana created a project owned by Ben';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - nobody can create a project in someone else''s name'

do $$
begin
  update public.projects
    set owner_id = '00000000-0000-0000-0000-0000000000b2';
  raise exception 'Ana handed her project to Ben';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - nobody can hand a project to someone else'

do $$
begin
  insert into public.projects (name) values ('   ');
  raise exception 'a blank project name was accepted';
exception when check_violation then
  null;
end $$;
\echo 'ok - a project needs a name'

-- Ben is signed in.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';

do $$
declare
  changed int;
begin
  assert (select count(*) from public.projects) = 0,
    'Ben should not see Ana''s project';

  update public.projects set name = 'Renamed by Ben';
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben renamed Ana''s project';

  delete from public.projects;
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben deleted Ana''s project';

  insert into public.projects (name) values ('Ben sneakers');
  assert (select count(*) from public.projects) = 1,
    'Ben should see only his own project';
end $$;
\echo 'ok - another advertiser cannot see, rename or delete it'

-- Nobody is signed in.
reset role;
set local role anon;

do $$
begin
  perform count(*) from public.projects;
  raise exception 'a signed-out visitor read the projects table';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - signed-out visitors cannot read projects at all'

-- Ana's project is untouched by everything Ben tried.
reset role;
do $$
begin
  assert (
    select name from public.projects
    where owner_id = '00000000-0000-0000-0000-0000000000a1'
  ) = 'Ana water bottle', 'Ana''s project changed';
end $$;
\echo 'ok - Ana''s project survived'

rollback;
