-- Migration: Squad assets and dummy-data cleanup
-- Adds private Supabase Storage support for squad imagery and removes defaults
-- that create fake dashboard content for new groups.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'group-assets',
  'group-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

alter table public.groups
  add column if not exists cover_image_path text,
  alter column purpose drop default,
  alter column purpose drop not null,
  alter column progress_current set default 0,
  alter column progress_target drop default,
  alter column progress_target drop not null;

alter table public.group_members
  add column if not exists avatar_image_path text;

alter table public.group_meetups
  alter column title drop default,
  alter column starts_at drop default;

alter table public.group_perks
  alter column title drop default,
  alter column code drop default;

create or replace function public.storage_group_id(p_name text)
returns uuid
language sql
stable
as $$
  select nullif((storage.foldername(p_name))[1], '')::uuid;
$$;

create or replace function public.storage_group_asset_owner_id(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when (storage.foldername(p_name))[2] = 'members'
      then nullif((storage.foldername(p_name))[3], '')::uuid
    else null
  end;
$$;

drop policy if exists "group-assets: members read" on storage.objects;
create policy "group-assets: members read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'group-assets'
    and public.is_group_member(public.storage_group_id(name))
  );

drop policy if exists "group-assets: managers insert cover" on storage.objects;
create policy "group-assets: managers insert cover"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-assets'
    and (storage.foldername(name))[2] = 'cover'
    and public.can_manage_group(public.storage_group_id(name))
  );

drop policy if exists "group-assets: managers update cover" on storage.objects;
create policy "group-assets: managers update cover"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'group-assets'
    and (storage.foldername(name))[2] = 'cover'
    and public.can_manage_group(public.storage_group_id(name))
  )
  with check (
    bucket_id = 'group-assets'
    and (storage.foldername(name))[2] = 'cover'
    and public.can_manage_group(public.storage_group_id(name))
  );

drop policy if exists "group-assets: members insert own avatar" on storage.objects;
create policy "group-assets: members insert own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'group-assets'
    and (storage.foldername(name))[2] = 'members'
    and public.storage_group_asset_owner_id(name) = auth.uid()
    and public.is_group_member(public.storage_group_id(name))
  );

drop policy if exists "group-assets: members update own avatar" on storage.objects;
create policy "group-assets: members update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'group-assets'
    and (storage.foldername(name))[2] = 'members'
    and public.storage_group_asset_owner_id(name) = auth.uid()
  )
  with check (
    bucket_id = 'group-assets'
    and (storage.foldername(name))[2] = 'members'
    and public.storage_group_asset_owner_id(name) = auth.uid()
    and public.is_group_member(public.storage_group_id(name))
  );
