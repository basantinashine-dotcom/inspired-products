-- Step 3: build to Amazon DSP's responsive eCommerce creative.
--
-- An ad in that slot is a custom image plus separate text and logo fields
-- that Amazon lays out itself. Nothing is drawn onto the image. This
-- migration gives each of those parts a home:
--
--   projects.logo_*      the brand logo, one per campaign
--   products.disclaimer  only for products that need one
--   variants             one row per ad, with its headline
--
-- Amazon's limits are repeated here as checks, so the database refuses
-- anything the slot would refuse, whatever the page sends.

-- Brand logo ----------------------------------------------------------------

-- At least 600×100 px. Either all three columns are set or none are: a path
-- without a size would let a too-small logo slip past the size check, which
-- in SQL passes when a value is missing.
alter table public.projects
  add column logo_path text,
  add column logo_width int,
  add column logo_height int,
  add constraint projects_logo_size check (
    (logo_path is null and logo_width is null and logo_height is null)
    or (
      logo_path is not null
      and logo_width is not null and logo_width >= 600
      and logo_height is not null and logo_height >= 100
    )
  );

-- The logo must sit in the owner's own folder for this campaign, just as a
-- product's photo must.
drop policy "owners create their projects" on public.projects;
create policy "owners create their projects"
  on public.projects for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (logo_path is null
      or logo_path like (select auth.uid())::text || '/' || id::text || '/%')
  );

drop policy "owners update their projects" on public.projects;
create policy "owners update their projects"
  on public.projects for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (logo_path is null
      or logo_path like (select auth.uid())::text || '/' || id::text || '/%')
  );

-- Logos get their own private bucket because their limit is tighter than a
-- photo's: PNG or JPEG, at most 1 MB. "1 MB" is read as 1,000,000 bytes, the
-- stricter reading, so a logo passes whichever Amazon means.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 1000000, array['image/jpeg', 'image/png']);

create policy "owners read their logos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owners upload their logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "owners delete their logos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Disclaimer ----------------------------------------------------------------

-- Optional, at most 60 characters. Stored already trimmed, so a blank or
-- space-padded disclaimer is refused rather than saved.
alter table public.products
  add column disclaimer text check (
    disclaimer is null
    or (char_length(disclaimer) between 1 and 60 and disclaimer = btrim(disclaimer))
  );

-- Ads ---------------------------------------------------------------------

-- One row per ad made from a product photo. Step 4 adds the edit recipe
-- (the crops and colour settings) to it.
create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products (id) on delete cascade,
  -- Optional, at most 50 characters. char_length counts characters, not
  -- bytes, so an emoji counts once.
  headline text check (
    headline is null
    or (char_length(headline) between 1 and 50 and headline = btrim(headline))
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index variants_product_id_idx on public.variants (product_id);

create trigger variants_set_updated_at
  before update on public.variants
  for each row execute function public.set_updated_at();

revoke all on public.variants from anon, authenticated;
grant select, insert, update, delete on public.variants to authenticated;

alter table public.variants enable row level security;

-- An ad belongs to whoever owns its product's campaign: ownership is
-- inherited twice over, never copied.
create policy "owners read their ads"
  on public.variants for select to authenticated
  using (exists (
    select 1
    from public.products pr
    join public.projects p on p.id = pr.project_id
    where pr.id = variants.product_id
      and p.owner_id = (select auth.uid())
  ));

create policy "owners add ads to their products"
  on public.variants for insert to authenticated
  with check (exists (
    select 1
    from public.products pr
    join public.projects p on p.id = pr.project_id
    where pr.id = variants.product_id
      and p.owner_id = (select auth.uid())
  ));

create policy "owners update their ads"
  on public.variants for update to authenticated
  using (exists (
    select 1
    from public.products pr
    join public.projects p on p.id = pr.project_id
    where pr.id = variants.product_id
      and p.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.products pr
    join public.projects p on p.id = pr.project_id
    where pr.id = variants.product_id
      and p.owner_id = (select auth.uid())
  ));

create policy "owners delete their ads"
  on public.variants for delete to authenticated
  using (exists (
    select 1
    from public.products pr
    join public.projects p on p.id = pr.project_id
    where pr.id = variants.product_id
      and p.owner_id = (select auth.uid())
  ));
