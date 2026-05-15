-- Treat blank spot image paths as image-less for Storage RLS and image attach.
-- Some production rows can contain '' instead of null, which looks empty in
-- the UI but fails policies that only check `image_path is null`.

update public.spots
   set image_path = null
 where image_path is not null
   and nullif(btrim(image_path), '') is null;

create or replace function public.storage_spot_image_spot_id(p_name text)
returns uuid
language sql
stable
as $$
  with parts as (
    select storage.foldername(coalesce(p_name, '')) as path
  )
  select case
    when array_length(path, 1) >= 2
      and path[1] = 'spots'
      and path[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then path[2]::uuid
    else null
  end
  from parts;
$$;

drop policy if exists "spot-images: authenticated insert for image-less spot" on storage.objects;
create policy "spot-images: authenticated insert for image-less spot"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'spot-images'
    and (storage.foldername(name))[1] = 'spots'
    and public.storage_spot_image_spot_id(name) is not null
    and exists (
      select 1
      from public.spots as s
      where s.id = public.storage_spot_image_spot_id(name)
        and s.is_active = true
        and (
          nullif(btrim(coalesce(s.image_path, '')), '') is null
          or s.created_by = auth.uid()
        )
    )
  );

drop policy if exists "spot-images: authenticated update own upload" on storage.objects;
create policy "spot-images: authenticated update own upload"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'spot-images'
    and (storage.foldername(name))[1] = 'spots'
    and public.storage_spot_image_spot_id(name) is not null
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
    and public.storage_spot_image_spot_id(name) is not null
    and exists (
      select 1
      from public.spots as s
      where s.id = public.storage_spot_image_spot_id(name)
        and s.is_active = true
        and (owner = auth.uid() or s.created_by = auth.uid())
    )
  );

create or replace function public.set_spot_image(
  p_spot_id uuid,
  p_image_path text
)
returns public.spots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot public.spots%rowtype;
  v_path_spot_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if nullif(btrim(coalesce(p_image_path, '')), '') is null then
    raise exception 'Image path is required.';
  end if;

  v_path_spot_id := public.storage_spot_image_spot_id(p_image_path);
  if v_path_spot_id is distinct from p_spot_id then
    raise exception 'Image path does not belong to this spot.';
  end if;

  update public.spots
     set image_path = p_image_path,
         updated_at = now()
   where id = p_spot_id
     and is_active = true
     and (
       nullif(btrim(coalesce(image_path, '')), '') is null
       or created_by = auth.uid()
     )
   returning * into v_spot;

  if not found then
    raise exception 'Spot image could not be attached.';
  end if;

  return v_spot;
end;
$$;

revoke all on function public.set_spot_image(uuid, text) from public;
grant execute on function public.set_spot_image(uuid, text) to authenticated;
grant execute on function public.storage_spot_image_spot_id(text) to authenticated;

notify pgrst, 'reload schema';
