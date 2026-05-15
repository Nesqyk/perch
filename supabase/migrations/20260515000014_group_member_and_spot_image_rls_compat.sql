-- Compatibility repair for auth-backed squad membership and community spot
-- image uploads. Reasserts the intended defaults/policies for production
-- databases that may have partially applied earlier migrations.

alter table public.group_members
  alter column user_id set default auth.uid();

drop policy if exists "group_members: members read authenticated" on public.group_members;
create policy "group_members: members read authenticated"
  on public.group_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
  );

drop policy if exists "group_members: authenticated insert self" on public.group_members;
create policy "group_members: authenticated insert self"
  on public.group_members for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "group_members: self presence update" on public.group_members;
create policy "group_members: self presence update"
  on public.group_members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "spot-images: authenticated insert for image-less spot" on storage.objects;
create policy "spot-images: authenticated insert for image-less spot"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'spot-images'
    and (storage.foldername(name))[1] = 'spots'
    and exists (
      select 1
      from public.spots as s
      where s.id = public.storage_spot_image_spot_id(name)
        and s.is_active = true
        and (s.image_path is null or s.created_by = auth.uid())
    )
  );

drop policy if exists "spot-images: authenticated update own upload" on storage.objects;
create policy "spot-images: authenticated update own upload"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'spot-images'
    and (storage.foldername(name))[1] = 'spots'
    and exists (
      select 1
      from public.spots as s
      where s.id = public.storage_spot_image_spot_id(name)
        and s.is_active = true
        and (owner = auth.uid() or s.created_by = auth.uid())
    )
  )
  with check (
    bucket_id = 'spot-images'
    and (storage.foldername(name))[1] = 'spots'
    and exists (
      select 1
      from public.spots as s
      where s.id = public.storage_spot_image_spot_id(name)
        and s.is_active = true
        and (owner = auth.uid() or s.created_by = auth.uid())
    )
  );

grant execute on function public.storage_spot_image_spot_id(text) to authenticated;

notify pgrst, 'reload schema';
