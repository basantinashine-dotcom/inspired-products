-- Product photos: only the owner of a campaign can add, see or remove them,
-- in the products table and in photo storage alike.
--
-- Ana:  user 00000000-0000-0000-0000-0000000000a1, project aaaaaaaa-...-01
-- Ben:  user 00000000-0000-0000-0000-0000000000b2, project bbbbbbbb-...-01

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@example.com');

insert into public.projects (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Ana kitchen range'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Ben running range');

-- Ana is signed in.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

insert into storage.objects (bucket_id, name) values (
  'drafts',
  '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-0000-0000-0000-000000000001/cccccccc-0000-0000-0000-000000000001/original.jpg'
);
insert into public.products (id, project_id, name, photo_path, photo_width, photo_height) values (
  'cccccccc-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Steel water bottle',
  '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-0000-0000-0000-000000000001/cccccccc-0000-0000-0000-000000000001/original.jpg',
  2000, 2000
);

do $$
begin
  assert (select count(*) from public.products) = 1, 'Ana should see her product';
  assert (select count(*) from storage.objects) = 1, 'Ana should see her photo';
end $$;
\echo 'ok - an owner can upload a photo and add it to their campaign'

do $$
begin
  insert into public.products (project_id, name, photo_path, photo_width, photo_height) values (
    'bbbbbbbb-0000-0000-0000-000000000001', 'Planted',
    '00000000-0000-0000-0000-0000000000a1/bbbbbbbb-0000-0000-0000-000000000001/x/original.jpg',
    100, 100);
  raise exception 'Ana added a product to Ben''s campaign';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - nobody can add products to someone else''s campaign'

do $$
begin
  insert into public.products (project_id, name, photo_path, photo_width, photo_height) values (
    'aaaaaaaa-0000-0000-0000-000000000001', 'Borrowed photo',
    '00000000-0000-0000-0000-0000000000b2/bbbbbbbb-0000-0000-0000-000000000001/x/original.jpg',
    100, 100);
  raise exception 'Ana''s product points at a photo in Ben''s folder';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - a product can only point at a photo in its owner''s folder'

do $$
begin
  update public.products set project_id = 'bbbbbbbb-0000-0000-0000-000000000001';
  raise exception 'Ana moved her product into Ben''s campaign';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - nobody can move a product into someone else''s campaign'

do $$
begin
  insert into storage.objects (bucket_id, name) values (
    'drafts',
    '00000000-0000-0000-0000-0000000000b2/bbbbbbbb-0000-0000-0000-000000000001/x/original.jpg');
  raise exception 'Ana uploaded into Ben''s folder';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - nobody can upload into someone else''s folder'

do $$
declare
  changed int;
begin
  update storage.objects set metadata = '{"replaced": true}';
  get diagnostics changed = row_count;
  assert changed = 0, 'Ana overwrote an original photo';
end $$;
\echo 'ok - an uploaded original cannot be overwritten'

-- Ben is signed in.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';

do $$
declare
  changed int;
begin
  assert (select count(*) from public.products) = 0, 'Ben sees Ana''s products';
  assert (select count(*) from storage.objects) = 0, 'Ben sees Ana''s photos';

  update public.products set name = 'Renamed by Ben';
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben renamed Ana''s product';

  delete from public.products;
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben deleted Ana''s product';

  delete from storage.objects;
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben deleted Ana''s photo';
end $$;
\echo 'ok - another advertiser cannot see, change or delete products or photos'

-- Nobody is signed in.
reset role;
set local role anon;

do $$
begin
  assert (select count(*) from storage.objects) = 0,
    'a signed-out visitor sees photos';
  perform count(*) from public.products;
  raise exception 'a signed-out visitor read the products table';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - signed-out visitors see no products and no photos'

-- Ana again: removing a photo, then her whole campaign.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

do $$
declare
  changed int;
begin
  delete from storage.objects;
  get diagnostics changed = row_count;
  assert changed = 1, 'Ana could not delete her own photo';

  delete from public.projects where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert (select count(*) from public.products) = 0,
    'deleting a campaign should delete its products';
end $$;
\echo 'ok - an owner can delete a photo, and a campaign takes its products with it'

rollback;
