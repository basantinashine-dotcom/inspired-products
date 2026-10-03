-- Step 2: a project is a campaign holding several product photos.
--
-- Each photo is a row in products, and the file itself lives in the private
-- "drafts" storage bucket at:
--
--   <owner's user id>/<project id>/<product id>/original.<jpg|png|webp>
--
-- The same rule as Step 1 protects both: only the owner can reach them.

-- Products ----------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null
    references public.projects (id) on delete cascade,
  name text not null
    check (char_length(trim(name)) between 1 and 100),
  photo_path text not null,
  photo_width int not null check (photo_width > 0),
  photo_height int not null check (photo_height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_project_id_idx on public.products (project_id);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

revoke all on public.products from anon, authenticated;
grant select, insert, update, delete on public.products to authenticated;

alter table public.products enable row level security;

-- A product has no owner column of its own: it belongs to whoever owns its
-- project. One source of truth means ownership can never disagree.
create policy "owners read their products"
  on public.products for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = products.project_id
      and p.owner_id = (select auth.uid())
  ));

-- On the way in, two checks: the project is yours, and the photo the row
-- points at sits in your own folder for that project.
create policy "owners add products to their projects"
  on public.products for insert to authenticated
  with check (
    exists (
      select 1 from public.projects p
      where p.id = products.project_id
        and p.owner_id = (select auth.uid())
    )
    and photo_path like (select auth.uid())::text || '/' || project_id::text || '/%'
  );

create policy "owners update their products"
  on public.products for update to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = products.project_id
      and p.owner_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.projects p
      where p.id = products.project_id
        and p.owner_id = (select auth.uid())
    )
    and photo_path like (select auth.uid())::text || '/' || project_id::text || '/%'
  );

create policy "owners delete their products"
  on public.products for delete to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = products.project_id
      and p.owner_id = (select auth.uid())
  ));

-- Photo storage -----------------------------------------------------------

-- Private: no public links. The storage service itself turns away anything
-- over 20 MB or not a JPEG, PNG or WebP image, whatever the page allows.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'drafts', 'drafts', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Files are rows in storage.objects, guarded the same way. The first folder
-- of every path is the owner's user id, so the check is: is that you?
create policy "owners read their drafts"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drafts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owners upload to their drafts"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drafts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owners delete their drafts"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'drafts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Deliberately no update policy: an uploaded original can be deleted but
-- never overwritten. Edits will be stored as a recipe applied on top.
