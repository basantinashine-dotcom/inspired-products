-- The parts of a DSP responsive ad: brand logo, disclaimer and headline.
-- Amazon's limits hold in the database, and only the owner can touch them.
--
-- Ana:  user ...a1, project aaaaaaaa-...-01, product cccccccc-...-01
-- Ben:  user ...b2, project bbbbbbbb-...-01, product dddddddd-...-01

\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@example.com');

insert into public.projects (id, owner_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Ana kitchen range'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Ben running range');

insert into public.products (id, project_id, name, photo_path, photo_width, photo_height) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Steel bottle',
   '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-0000-0000-0000-000000000001/cccccccc-0000-0000-0000-000000000001/original.jpg', 2000, 2000),
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Trail shoe',
   '00000000-0000-0000-0000-0000000000b2/bbbbbbbb-0000-0000-0000-000000000001/dddddddd-0000-0000-0000-000000000001/original.jpg', 2000, 2000);

do $$
begin
  assert (select file_size_limit from storage.buckets where id = 'logos') = 1000000,
    'logos bucket should cap files at 1,000,000 bytes';
  assert (select allowed_mime_types from storage.buckets where id = 'logos')
    = array['image/jpeg', 'image/png'],
    'logos bucket should take only JPEG and PNG';
  assert not (select public from storage.buckets where id = 'logos'),
    'logos bucket should be private';
end $$;
\echo 'ok - logos have their own private bucket: PNG or JPEG, up to 1 MB'

-- Ana is signed in.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

-- Brand logo.
insert into storage.objects (bucket_id, name) values (
  'logos', '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-0000-0000-0000-000000000001/logo-1.png');
update public.projects set
  logo_path = '00000000-0000-0000-0000-0000000000a1/aaaaaaaa-0000-0000-0000-000000000001/logo-1.png',
  logo_width = 800, logo_height = 200
where id = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
begin
  assert (select logo_width from public.projects) = 800, 'Ana''s logo should be saved';
end $$;
\echo 'ok - an owner can upload a logo and set it on their campaign'

do $$
begin
  update public.projects set logo_width = 500;
  raise exception 'a logo narrower than 600 px was accepted';
exception when check_violation then
  null;
end $$;
do $$
begin
  update public.projects set logo_height = 99;
  raise exception 'a logo shorter than 100 px was accepted';
exception when check_violation then
  null;
end $$;
do $$
begin
  update public.projects set logo_width = null, logo_height = null;
  raise exception 'a logo with no size was accepted';
exception when check_violation then
  null;
end $$;
\echo 'ok - a logo must be at least 600×100 px, with its size recorded'

do $$
begin
  update public.projects set
    logo_path = '00000000-0000-0000-0000-0000000000b2/bbbbbbbb-0000-0000-0000-000000000001/logo.png';
  raise exception 'Ana''s campaign points at a logo in Ben''s folder';
exception when insufficient_privilege then
  null;
end $$;
do $$
begin
  insert into storage.objects (bucket_id, name) values (
    'logos', '00000000-0000-0000-0000-0000000000b2/bbbbbbbb-0000-0000-0000-000000000001/logo.png');
  raise exception 'Ana uploaded a logo into Ben''s folder';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - logos stay in their owner''s folder'

-- Disclaimer.
do $$
begin
  update public.products set disclaimer = repeat('d', 60);
  assert (select char_length(disclaimer) from public.products) = 60,
    'a 60-character disclaimer should be saved';
  update public.products set disclaimer = null;
end $$;
do $$
begin
  update public.products set disclaimer = repeat('d', 61);
  raise exception 'a 61-character disclaimer was accepted';
exception when check_violation then
  null;
end $$;
do $$
begin
  update public.products set disclaimer = '   ';
  raise exception 'a blank disclaimer was accepted';
exception when check_violation then
  null;
end $$;
\echo 'ok - a disclaimer is optional and at most 60 characters'

-- Ads and headlines.
insert into public.variants (id, product_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001');

do $$
begin
  update public.variants set headline = repeat('h', 50);
  -- 50 emoji are 50 characters, though 200 bytes and 100 JavaScript "length".
  update public.variants set headline = repeat(U&'\+01F642', 50);
  assert (select char_length(headline) from public.variants) = 50,
    'emoji should count as one character each';
end $$;
do $$
begin
  update public.variants set headline = repeat('h', 51);
  raise exception 'a 51-character headline was accepted';
exception when check_violation then
  null;
end $$;
do $$
begin
  update public.variants set headline = ' Padded ';
  raise exception 'a space-padded headline was accepted';
exception when check_violation then
  null;
end $$;
do $$
begin
  update public.variants set headline = null;
  assert (select headline from public.variants) is null, 'a headline is optional';
end $$;
\echo 'ok - a headline is optional and at most 50 characters, counting emoji once'

do $$
begin
  insert into public.variants (product_id) values ('dddddddd-0000-0000-0000-000000000001');
  raise exception 'Ana added an ad to Ben''s product';
exception when insufficient_privilege then
  null;
end $$;
do $$
begin
  update public.variants set product_id = 'dddddddd-0000-0000-0000-000000000001';
  raise exception 'Ana moved her ad onto Ben''s product';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - nobody can add or move ads onto someone else''s product'

-- Ben is signed in.
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "role": "authenticated"}';

do $$
declare
  changed int;
begin
  assert (select count(*) from public.variants) = 0, 'Ben sees Ana''s ads';
  assert (select count(*) from storage.objects where bucket_id = 'logos') = 0,
    'Ben sees Ana''s logo';

  update public.variants set headline = 'Ben was here';
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben changed Ana''s headline';

  delete from public.variants;
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben deleted Ana''s ad';

  update public.products set disclaimer = 'Ben was here'
    where id = 'cccccccc-0000-0000-0000-000000000001';
  get diagnostics changed = row_count;
  assert changed = 0, 'Ben changed Ana''s disclaimer';
end $$;
\echo 'ok - another advertiser cannot see or change ads, logos or disclaimers'

-- Nobody is signed in.
reset role;
set local role anon;

do $$
begin
  perform count(*) from public.variants;
  raise exception 'a signed-out visitor read the ads table';
exception when insufficient_privilege then
  null;
end $$;
\echo 'ok - signed-out visitors cannot read ads'

-- Ana deletes her product: its ads go with it.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';

do $$
begin
  delete from public.products where id = 'cccccccc-0000-0000-0000-000000000001';
  assert (select count(*) from public.variants) = 0,
    'deleting a product should delete its ads';
end $$;
\echo 'ok - deleting a product deletes its ads'

rollback;
