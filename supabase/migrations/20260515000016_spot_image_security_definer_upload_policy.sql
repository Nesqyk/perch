-- Final compatibility repair for spot image Storage RLS.
-- Storage policies call this security-definer helper instead of directly
-- querying public.spots from the storage.objects policy predicate.

create or replace function public.can_upload_spot_image(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_spot_id uuid;
  v_image_path text;
  v_created_by uuid;
  v_is_active boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_spot_id := public.storage_spot_image_spot_id(p_name);
  if v_spot_id is null then
    return false;
  end if;

  select s.image_path, s.created_by, s.is_active
    into v_image_path, v_created_by, v_is_active
    from public.spots as s
   where s.id = v_spot_id;

  if not found or v_is_active is not true then
    return false;
  end if;

  return nullif(btrim(coalesce(v_image_path, '')), '') is null
    or v_created_by = auth.uid();
end;
$$;

revoke all on function public.can_upload_spot_image(text) from public;
revoke all on function public.can_upload_spot_image(text) from anon;
grant execute on function public.can_upload_spot_image(text) to authenticated;

drop policy if exists "spot-images: authenticated insert for image-less spot" on storage.objects;
create policy "spot-images: authenticated insert for image-less spot"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'spot-images'
    and public.can_upload_spot_image(name)
  );

drop policy if exists "spot-images: authenticated update own upload" on storage.objects;
create policy "spot-images: authenticated update own upload"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'spot-images'
    and public.can_upload_spot_image(name)
  )
  with check (
    bucket_id = 'spot-images'
    and public.can_upload_spot_image(name)
  );

notify pgrst, 'reload schema';
